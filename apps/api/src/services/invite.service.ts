import { randomBytes } from 'crypto';
import {
  ANALYTICS_EVENTS,
  SHARE_PICKER_USERNAME,
  applyRewardMultiplier,
  calcSendCost,
  formatViralBanShareMessage,
  normalizeBanTone,
} from '@98plus/shared';
import { BanInviteRecipientMode, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { mapBanToInteraction } from './ban.service';
import { linkPairInteraction } from './energy.service';
import { trackEvent } from './analytics.service';
import { buildBotStartUrl, buildStartParam } from '@98plus/shared';
import { REPLY_BAN_WEBAPP_BUTTON_LABEL } from '@98plus/shared';
import { botUsername, botWebAppButtonUrl } from '../lib/deeplink';
import { sendPendingBanInviteToUser } from '../bot/notifications';
import { broadcastToUser } from '../websocket/hub';
import type { BanInteraction } from '@98plus/shared';
import {
  materializeRegisteredUser,
  recordSocialContact,
} from './social-graph.service';
import { pushFriendsGraphRefresh } from './friends-sync';
import {
  appendJournalOpsFlatTx,
  publishCommittedNotificationDeltas,
} from '../notifications/notification-journal-commit';
import { opsUpsertIncomingForReceiver, banPartyFromUsers } from '../notifications/ban-notification-ops';

const INVITE_TTL_DAYS = 7;

export function normalizeUsername(raw: string): string {
  return raw.replace('@', '').trim().toLowerCase();
}

function generateInviteToken(): string {
  return randomBytes(8).toString('base64url').slice(0, 12);
}

export function inviteLinks(token: string) {
  const startParam = buildStartParam({ type: 'invite_token', token });
  const bot = botUsername();
  return {
    webAppButton: botWebAppButtonUrl(
      { type: 'invite_token', token },
      {
        source: 'inviteLinks',
        buttonLabel: REPLY_BAN_WEBAPP_BUTTON_LABEL,
      },
    ),
    botStart: buildBotStartUrl(bot, startParam),
    startParam,
  };
}

export async function createPendingInvite(params: {
  senderId: string;
  targetUsername: string;
  text: string;
  durationMinutes: number;
  tone?: string | null;
}) {
  const targetUsername = normalizeUsername(params.targetUsername);
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);

  const invite = await prisma.banInvite.create({
    data: {
      token,
      senderId: params.senderId,
      targetUsername,
      text: params.text.trim(),
      durationMinutes: params.durationMinutes,
      tone: normalizeBanTone(params.tone),
      expiresAt,
    },
    include: { sender: true },
  });

  const links = inviteLinks(token);

  await trackEvent(ANALYTICS_EVENTS.INVITE_PENDING_CREATED, params.senderId, {
    token,
    targetUsername,
  });

  const senderUsername =
    invite.sender.username ?? invite.sender.firstName;

  const shareText = formatViralBanShareMessage({
    banText: invite.text,
    durationMinutes: invite.durationMinutes,
    link: links.botStart,
  });

  await sendPendingBanInviteToUser({
    targetUsername,
    senderUsername,
    senderFirstName: invite.sender.firstName,
    senderPhotoUrl: invite.sender.photoUrl,
    banText: invite.text,
    durationMinutes: invite.durationMinutes,
    deepLink: links.webAppButton,
  });

  await recordSocialContact(params.senderId, {
    username: targetUsername,
    recentChallenge: invite.text,
    source: 'INVITE_SENT',
  });

  return { invite, links, shareText, shareUrl: links.botStart };
}

export async function findPreparedInviteByClientRequestId(
  senderId: string,
  clientRequestId: string,
) {
  return prisma.banInvite.findUnique({
    where: {
      senderId_clientRequestId: { senderId, clientRequestId },
    },
  });
}

function preparedInviteSharePayload(invite: {
  token: string;
  text: string;
  durationMinutes: number;
}) {
  const links = inviteLinks(invite.token);
  const shareText = formatViralBanShareMessage({
    banText: invite.text,
    durationMinutes: invite.durationMinutes,
    link: links.botStart,
  });
  return { links, shareText, shareUrl: links.botStart };
}

/**
 * Create one recipient-less BanInvite and charge the sender in the same DB
 * transaction. The composite key is replay protection for repeated hold
 * callbacks, rerenders, retries, and SUCCESS re-entry.
 */
export async function createPreparedInviteOnce(params: {
  senderId: string;
  clientRequestId: string;
  text: string;
  durationMinutes: number;
  tone?: string | null;
}) {
  const existing = await findPreparedInviteByClientRequestId(
    params.senderId,
    params.clientRequestId,
  );
  if (existing) {
    return {
      invite: existing,
      created: false,
      energyDelta: 0,
      ...preparedInviteSharePayload(existing),
    };
  }

  const sender = await prisma.user.findUnique({
    where: { id: params.senderId },
    select: { energy: true },
  });
  if (!sender) throw new Error('User not found');

  const energyDelta = applyRewardMultiplier(
    calcSendCost().sender,
    sender.energy,
  );
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);

  try {
    const [invite] = await prisma.$transaction([
      prisma.banInvite.create({
        data: {
          token,
          senderId: params.senderId,
          targetUsername: null,
          recipientMode: BanInviteRecipientMode.KNOWN_BY_SENDER,
          clientRequestId: params.clientRequestId,
          text: params.text.trim(),
          durationMinutes: params.durationMinutes,
          tone: normalizeBanTone(params.tone),
          expiresAt,
        },
      }),
      prisma.user.update({
        where: { id: params.senderId },
        data: { energy: { increment: energyDelta } },
      }),
    ]);

    await trackEvent(ANALYTICS_EVENTS.INVITE_PENDING_CREATED, params.senderId, {
      token: invite.token,
      recipientMode: 'KNOWN_BY_SENDER',
    });

    return {
      invite,
      created: true,
      energyDelta,
      ...preparedInviteSharePayload(invite),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const replay = await findPreparedInviteByClientRequestId(
        params.senderId,
        params.clientRequestId,
      );
      if (replay) {
        return {
          invite: replay,
          created: false,
          energyDelta: 0,
          ...preparedInviteSharePayload(replay),
        };
      }
    }
    throw error;
  }
}

/** Claim all pending invites matching this user's username */
export async function claimInvitesForUser(
  userId: string,
  username: string | null,
): Promise<BanInteraction | null> {
  if (!username) return null;
  const clean = normalizeUsername(username);

  const pending = await prisma.banInvite.findMany({
    where: {
      targetUsername: clean,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    include: { sender: true },
  });

  let firstIncoming: BanInteraction | null = null;

  for (const invite of pending) {
    if (invite.senderId === userId) continue;

    const ban = await materializeInviteAsBan(invite.id, userId);
    if (ban && !firstIncoming) {
      firstIncoming = await mapBanToInteraction(ban.id, userId);
    }
  }

  return firstIncoming;
}

export async function claimInviteByToken(
  token: string,
  userId: string,
  username: string | null,
): Promise<BanInteraction | null> {
  const invite = await prisma.banInvite.findUnique({
    where: { token },
    include: { sender: true },
  });

  if (!invite || invite.status !== 'PENDING') return null;
  if (invite.expiresAt < new Date()) {
    await prisma.banInvite.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    return null;
  }

  if (invite.senderId === userId) return null;

  // Token link is authoritative — recipient need not match pre-filled @username
  const ban = await materializeInviteAsBan(invite.id, userId);
  if (!ban) return null;

  if (username) {
    const clean = normalizeUsername(username);
    if (clean !== invite.targetUsername) {
      await prisma.banInvite.update({
        where: { id: invite.id },
        data: { targetUsername: clean },
      });
    }
  }

  return mapBanToInteraction(ban.id, userId);
}

async function materializeInviteAsBan(inviteId: string, receiverId: string) {
  const invite = await prisma.banInvite.findUnique({
    where: { id: inviteId },
    include: { sender: true },
  });
  if (!invite || invite.status !== 'PENDING' || invite.banId) return null;

  const { getOrCreateThread } = await import('./ban.service');
  const thread = await getOrCreateThread(invite.senderId, receiverId);

  const { ban, journalDeltas } = await prisma.$transaction(async (tx) => {
    const created = await tx.ban.create({
      data: {
        threadId: thread.id,
        senderId: invite.senderId,
        receiverId,
        text: invite.text,
        durationMinutes: invite.durationMinutes,
        tone: invite.tone,
        status: 'PENDING',
        inviteId: invite.id,
      },
    });

    await tx.banInvite.update({
      where: { id: invite.id },
      data: {
        status: 'CLAIMED',
        banId: created.id,
        claimedById: receiverId,
        claimedAt: new Date(),
      },
    });

    const receiverRow = await tx.user.findUnique({
      where: { id: receiverId },
      select: { id: true, username: true, firstName: true, photoUrl: true },
    });
    if (!receiverRow) throw new Error('Receiver not found');

    const deltas = await appendJournalOpsFlatTx(
      tx,
      opsUpsertIncomingForReceiver(
        banPartyFromUsers({
          id: created.id,
          text: created.text,
          senderId: created.senderId,
          receiverId: created.receiverId,
          durationMinutes: created.durationMinutes,
          createdAt: created.createdAt,
          sender: invite.sender,
          receiver: receiverRow,
        }),
      ),
    );
    return { ban: created, journalDeltas: deltas };
  });
  publishCommittedNotificationDeltas(journalDeltas);

  await linkPairInteraction(invite.senderId, receiverId);
  await trackEvent(ANALYTICS_EVENTS.INVITE_CLAIMED, receiverId, {
    inviteId: invite.id,
    banId: ban.id,
  });

  const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
  if (receiver) {
    await materializeRegisteredUser({
      id: receiver.id,
      username: receiver.username,
      firstName: receiver.firstName,
      photoUrl: receiver.photoUrl,
    });

    await recordSocialContact(receiverId, {
      username: invite.sender.username ?? invite.sender.firstName,
      contactUserId: invite.senderId,
      firstName: invite.sender.firstName,
      photoUrl: invite.sender.photoUrl,
      recentChallenge: invite.text,
      source: 'INVITE_CLAIMED',
    });

    const receiverContactKey = receiver.username
      ? normalizeUsername(receiver.username)
      : invite.targetUsername ?? `${SHARE_PICKER_USERNAME}:${receiver.id}`;

    await recordSocialContact(invite.senderId, {
      username: receiverContactKey,
      contactUserId: receiverId,
      firstName: receiver.firstName,
      photoUrl: receiver.photoUrl,
      recentChallenge: invite.text,
      source: 'INVITE_CLAIMED',
    });

    if (
      invite.targetUsername &&
      receiver.username &&
      normalizeUsername(receiver.username) !== invite.targetUsername
    ) {
      await prisma.socialContact.deleteMany({
        where: {
          ownerId: invite.senderId,
          contactUsername: invite.targetUsername,
          contactUserId: null,
        },
      });
    }

    await pushFriendsGraphRefresh(invite.senderId);
    await pushFriendsGraphRefresh(receiverId);
  }

  const interaction = await mapBanToInteraction(ban.id, receiverId);
  broadcastToUser(receiverId, { type: 'ban:incoming', payload: interaction });
  broadcastToUser(invite.senderId, {
    type: 'ban:updated',
    payload: await mapBanToInteraction(ban.id, invite.senderId),
  });

  return ban;
}

export async function getInvitePreview(token: string) {
  return prisma.banInvite.findUnique({
    where: { token },
    include: { sender: true },
  });
}
