import { randomBytes } from 'crypto';
import { ANALYTICS_EVENTS, formatChallengeShareMessage } from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { mapBanToInteraction } from './ban.service';
import { linkPairInteraction } from './energy.service';
import { trackEvent } from './analytics.service';
import {
  buildBotStartUrl,
  buildMiniAppUrl,
  buildStartParam,
} from '@98plus/shared';
import { botUsername } from '../lib/deeplink';
import { sendPendingBanInviteToUser } from '../bot/notifications';
import { broadcastToUser } from '../websocket/hub';
import type { BanInteraction } from '@98plus/shared';
import {
  materializeRegisteredUser,
  recordSocialContact,
} from './social-graph.service';
import { pushFriendsGraphRefresh } from './friends-sync';

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
    miniApp: buildMiniAppUrl(bot, startParam),
    botStart: buildBotStartUrl(bot, startParam),
    startParam,
  };
}

export async function createPendingInvite(params: {
  senderId: string;
  targetUsername: string;
  text: string;
  durationMinutes: number;
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

  const shareText = formatChallengeShareMessage({
    senderUsername,
    senderFirstName: invite.sender.firstName,
    banText: invite.text,
    durationMinutes: invite.durationMinutes,
  });

  await sendPendingBanInviteToUser({
    targetUsername,
    senderUsername,
    senderFirstName: invite.sender.firstName,
    senderPhotoUrl: invite.sender.photoUrl,
    banText: invite.text,
    durationMinutes: invite.durationMinutes,
    deepLink: links.miniApp,
  });

  await recordSocialContact(params.senderId, {
    username: targetUsername,
    recentChallenge: invite.text,
    source: 'INVITE_SENT',
  });

  return { invite, links, shareText, shareUrl: links.miniApp };
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

  const ban = await prisma.ban.create({
    data: {
      threadId: thread.id,
      senderId: invite.senderId,
      receiverId,
      text: invite.text,
      durationMinutes: invite.durationMinutes,
      status: 'PENDING',
      inviteId: invite.id,
    },
  });

  await prisma.banInvite.update({
    where: { id: invite.id },
    data: {
      status: 'CLAIMED',
      banId: ban.id,
      claimedById: receiverId,
      claimedAt: new Date(),
    },
  });

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
      : invite.targetUsername;

    await recordSocialContact(invite.senderId, {
      username: receiverContactKey,
      contactUserId: receiverId,
      firstName: receiver.firstName,
      photoUrl: receiver.photoUrl,
      recentChallenge: invite.text,
      source: 'INVITE_CLAIMED',
    });

    if (
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
