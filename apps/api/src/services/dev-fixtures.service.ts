import type { BanInteraction } from '@98plus/shared';
import { normalizeBanTone } from '@98plus/shared';
import type { Ban, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isDevAuthEnabled } from '../lib/dev-auth';
import { normalizeUsername } from './invite.service';
import { recordSocialContact } from './social-graph.service';
import { mapUser } from './user-mapper';

/** Dev auth Telegram id range (local / DEV_AUTH_ENABLED testing). */
export const DEV_TELEGRAM_ID_MIN = 100_000_001n;
export const DEV_TELEGRAM_ID_MAX = 100_000_099n;

export const DEV_SENDER_TELEGRAM_ID = 100_000_001n;
export const DEV_PEER_TELEGRAM_ID = 100_000_002n;
export const DEV_SENDER_USERNAME = 'dev_user';
export const DEV_PEER_USERNAME = 'dev_peer';
export const DEV_PEER_FIRST_NAME = 'Dev Peer';

export function isDevTelegramId(telegramId: bigint): boolean {
  return telegramId >= DEV_TELEGRAM_ID_MIN && telegramId <= DEV_TELEGRAM_ID_MAX;
}

export async function isDevModeUser(userId: string): Promise<boolean> {
  if (!isDevAuthEnabled()) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? isDevTelegramId(user.telegramId) : false;
}

async function findUserByUsername(username: string): Promise<User | null> {
  const clean = normalizeUsername(username);
  if (!clean) return null;
  return prisma.user.findFirst({
    where: { username: { equals: clean, mode: 'insensitive' } },
  });
}

export async function ensureDevPeerUser(): Promise<User> {
  return prisma.user.upsert({
    where: { telegramId: DEV_PEER_TELEGRAM_ID },
    create: {
      telegramId: DEV_PEER_TELEGRAM_ID,
      username: DEV_PEER_USERNAME,
      firstName: DEV_PEER_FIRST_NAME,
      isOnboarded: true,
      energy: 80,
    },
    update: {
      lastSeenAt: new Date(),
      username: DEV_PEER_USERNAME,
      firstName: DEV_PEER_FIRST_NAME,
    },
  });
}

/** Registered dev_peer contact for local browser testing. */
export async function ensureDevFixturesForUser(ownerId: string): Promise<void> {
  if (!isDevAuthEnabled()) return;

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner || !isDevTelegramId(owner.telegramId)) return;

  const peer = await ensureDevPeerUser();
  if (peer.id === ownerId) return;

  await recordSocialContact(ownerId, {
    username: DEV_PEER_USERNAME,
    contactUserId: peer.id,
    firstName: peer.firstName,
    photoUrl: peer.photoUrl,
    recentChallenge: null,
    source: 'INVITE_SENT',
  });
}

function isUsableReceiverId(
  receiverUserId: string | undefined,
  senderId: string,
): boolean {
  if (!receiverUserId?.trim()) return false;
  const id = receiverUserId.trim();
  if (id === senderId) return false;
  if (id.startsWith('contact:') || id.startsWith('optimistic')) return false;
  return true;
}

/**
 * Dev-only: always resolve to a registered peer (never self, never invite-only).
 */
export async function resolveDevBanReceiver(
  senderId: string,
  params: {
    receiverUserId?: string;
    receiverTelegramId?: bigint;
    receiverUsername?: string;
  },
  current: User | null,
): Promise<User> {
  const peer = await ensureDevPeerUser();
  const sender = await prisma.user.findUnique({ where: { id: senderId } });
  if (!sender) throw new Error('User not found');

  const senderUname = sender.username
    ? normalizeUsername(sender.username)
    : DEV_SENDER_USERNAME;
  const targetUname = params.receiverUsername
    ? normalizeUsername(params.receiverUsername)
    : null;

  if (current && current.id !== senderId) {
    return current;
  }

  if (isUsableReceiverId(params.receiverUserId, senderId)) {
    const byId = await prisma.user.findUnique({
      where: { id: params.receiverUserId!.trim() },
    });
    if (byId && byId.id !== senderId) return byId;
  }

  if (params.receiverTelegramId) {
    const byTg = await prisma.user.findUnique({
      where: { telegramId: params.receiverTelegramId },
    });
    if (byTg && byTg.id !== senderId) return byTg;
  }

  if (
    targetUname &&
    targetUname !== senderUname &&
    targetUname !== DEV_SENDER_USERNAME
  ) {
    const byName = await findUserByUsername(targetUname);
    if (byName && byName.id !== senderId) return byName;
  }

  return peer;
}

export function buildDevBanInteractionFallback(
  ban: Ban & { sender: User; receiver: User },
  viewerId: string,
): BanInteraction {
  return {
    id: ban.id,
    text: ban.text,
    status: 'pending',
    durationMinutes: ban.durationMinutes as BanInteraction['durationMinutes'],
    sender: mapUser(ban.sender),
    receiver: mapUser(ban.receiver),
    isIncoming: ban.receiverId === viewerId,
    createdAt: ban.createdAt.toISOString(),
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    checkDueAt: ban.checkDueAt?.toISOString() ?? null,
    threadId: ban.threadId,
    remainingMs: ban.durationMinutes * 60_000,
    serverNow: new Date().toISOString(),
    tone: normalizeBanTone(ban.tone),
  };
}
