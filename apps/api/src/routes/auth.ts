import { Router } from 'express';
import { validateInitData } from '../lib/telegram-auth';
import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { mapUser } from '../services/user-mapper';
import {
  claimInviteByToken,
  claimInvitesForUser,
} from '../services/invite.service';
import {
  parseStartParam,
  readStartParamFromInitData,
} from '@98plus/shared';
import { touchPresence } from '../services/presence.service';
import {
  linkContactsForRegisteredUser,
  materializeRegisteredUser,
} from '../services/social-graph.service';
import { pushFriendsGraphRefresh } from '../services/friends-sync';
import type { BanInteraction } from '@98plus/shared';

export const authRouter = Router();

async function afterAuth(
  userId: string,
  username: string | null,
  startParam?: string | null,
) {
  await touchPresence(userId);

  let claimedIncoming: BanInteraction | null = null;
  let viralOnboarding = false;

  const action = parseStartParam(startParam);
  if (action?.type === 'invite_token') {
    claimedIncoming = await claimInviteByToken(
      action.token,
      userId,
      username,
    );
    viralOnboarding = true;
  }

  if (!claimedIncoming) {
    claimedIncoming = await claimInvitesForUser(userId, username);
    if (claimedIncoming) viralOnboarding = true;
  }

  return {
    claimedIncoming,
    viralOnboarding,
    needsOnboardingRecovery: !!claimedIncoming,
  };
}

authRouter.post('/telegram', async (req, res) => {
  const { initData, startParam: startParamBody } = req.body as {
    initData?: string;
    startParam?: string;
  };
  const startParam =
    startParamBody?.trim() ||
    readStartParamFromInitData(initData) ||
    null;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData || !botToken) {
    res.status(400).json({ error: 'Missing initData or bot token' });
    return;
  }

  const tgUser = validateInitData(initData, botToken);
  if (!tgUser) {
    res.status(401).json({ error: 'Invalid Telegram auth' });
    return;
  }

  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(tgUser.id) },
    create: {
      telegramId: BigInt(tgUser.id),
      username: tgUser.username ?? null,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name ?? null,
      photoUrl: tgUser.photo_url ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      username: tgUser.username ?? null,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name ?? null,
      photoUrl: tgUser.photo_url ?? null,
      lastSeenAt: new Date(),
    },
  });

  const token = signToken({
    userId: user.id,
    telegramId: user.telegramId.toString(),
  });

  await linkContactsForRegisteredUser({
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    photoUrl: user.photoUrl,
  });

  const extra = await afterAuth(user.id, user.username, startParam);

  if (extra.claimedIncoming) {
    await materializeRegisteredUser({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      photoUrl: user.photoUrl,
    });
    if (extra.claimedIncoming.sender?.id) {
      await pushFriendsGraphRefresh(extra.claimedIncoming.sender.id);
    }
    await pushFriendsGraphRefresh(user.id);
  }

  if (extra.viralOnboarding || extra.claimedIncoming) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnboarded: true },
    });
  }

  res.json({
    token,
    user: mapUser(
      await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ),
    ...extra,
  });
});

authRouter.post('/dev', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).end();
    return;
  }

  const { telegramId, firstName, username, startParam } = req.body as {
    telegramId?: number;
    firstName?: string;
    username?: string;
    startParam?: string;
  };

  const id = telegramId ?? 100000001;
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(id) },
    create: {
      telegramId: BigInt(id),
      firstName: firstName ?? 'Dev',
      username: username ?? 'dev_user',
    },
    update: { lastSeenAt: new Date() },
  });

  const token = signToken({
    userId: user.id,
    telegramId: user.telegramId.toString(),
  });

  const extra = await afterAuth(user.id, user.username, startParam);

  res.json({ token, user: mapUser(user), ...extra });
});
