import { prisma } from '../lib/prisma';
import { isDevAuthEnabled } from '../lib/dev-auth';
import { recordSocialContact } from './social-graph.service';

/** Dev auth Telegram id range (local / DEV_AUTH_ENABLED testing). */
export const DEV_TELEGRAM_ID_MIN = 100_000_001n;
export const DEV_TELEGRAM_ID_MAX = 100_000_099n;

export const DEV_PEER_TELEGRAM_ID = 100_000_002n;
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

export async function ensureDevPeerUser() {
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
