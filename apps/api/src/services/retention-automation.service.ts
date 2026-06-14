import { prisma } from '../lib/prisma';
import {
  RETENTION_TEST_INTERVAL_MINUTES,
  retentionAutomationIntervalMs,
} from '../lib/retention-timing';
import { sendViralInviteBootNotification } from '../bot/notifications';
import { isDevTelegramId } from './dev-fixtures.service';
import { isUsablePairBanText } from './invite-deeplink.service';

const BATCH_SIZE = 40;

type CompletedBanPick = {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  friendId: string;
  friendUsername: string | null;
  friendFirstName: string;
};

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

async function loadCompletedBanPool(
  userId: string,
  excludeBanId: string | null,
): Promise<CompletedBanPick[]> {
  const bans = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: 'COMPLETED',
      funMode: false,
      ...(excludeBanId ? { id: { not: excludeBanId } } : {}),
    },
    select: {
      id: true,
      text: true,
      senderId: true,
      receiverId: true,
      sender: { select: { id: true, username: true, firstName: true } },
      receiver: { select: { id: true, username: true, firstName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 120,
  });

  const picks: CompletedBanPick[] = [];
  for (const ban of bans) {
    if (!isUsablePairBanText(ban.text)) continue;
    const friend =
      ban.senderId === userId ? ban.receiver : ban.sender;
    if (!friend?.id || friend.id === userId) continue;
    picks.push({
      id: ban.id,
      text: ban.text.trim(),
      senderId: ban.senderId,
      receiverId: ban.receiverId,
      friendId: friend.id,
      friendUsername: friend.username,
      friendFirstName: friend.firstName,
    });
  }
  return picks;
}

/** Automatic repeat-invite retention DMs — test cadence via RETENTION_TEST_INTERVAL_MINUTES. */
export async function processAutomaticRetention(): Promise<void> {
  const now = new Date();
  const cooldownBefore = new Date(now.getTime() - retentionAutomationIntervalMs());

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { sentBans: { some: { status: 'COMPLETED', funMode: false } } },
        { receivedBans: { some: { status: 'COMPLETED', funMode: false } } },
      ],
      NOT: {
        retentionLogs: {
          some: { sentAt: { gte: cooldownBefore } },
        },
      },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: BATCH_SIZE,
    select: {
      id: true,
      telegramId: true,
    },
  });

  let sentCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    if (isDevTelegramId(user.telegramId)) {
      skippedCount += 1;
      continue;
    }

    const lastRetention = await prisma.botRetentionLog.findFirst({
      where: { userId: user.id },
      orderBy: { sentAt: 'desc' },
      select: { banId: true },
    });

    const pool = await loadCompletedBanPool(user.id, lastRetention?.banId ?? null);
    const pick = pickRandom(pool);
    if (!pick) {
      skippedCount += 1;
      console.log('[retention-automation] skip', {
        userId: user.id,
        reason: 'no-eligible-ban',
        excludedBanId: lastRetention?.banId ?? null,
      });
      continue;
    }

    const delivery = await sendViralInviteBootNotification({
      telegramId: user.telegramId,
      inviterId: pick.friendId,
      inviterUsername: pick.friendUsername,
      inviterFirstName: pick.friendFirstName,
      mode: 'history',
      banText: pick.text,
      historyBanId: pick.id,
    });

    if (delivery !== 'sent') {
      skippedCount += 1;
      console.log('[retention-automation] skip', {
        userId: user.id,
        banId: pick.id,
        friendId: pick.friendId,
        reason: delivery === 'failed' ? 'telegram-send-failed' : 'dev-skipped',
      });
      continue;
    }

    await prisma.botRetentionLog.create({
      data: {
        userId: user.id,
        friendId: pick.friendId,
        banId: pick.id,
      },
    });

    sentCount += 1;
    console.log('[retention-automation] sent', {
      userId: user.id,
      banId: pick.id,
      friendId: pick.friendId,
      friendUsername: pick.friendUsername,
    });
  }

  console.log('[retention-automation] tick', {
    at: now.toISOString(),
    candidates: users.length,
    sentCount,
    skippedCount,
    intervalMinutes: RETENTION_TEST_INTERVAL_MINUTES,
  });
}
