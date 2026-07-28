import type { FriendCard } from '@98plus/shared';
import { sanitizeFriendCard } from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { normalizeUsername } from './invite.service';
import {
  FirstContactError,
  parseFirstContactUsername,
  FIRST_CONTACT_RATE_LIMIT_PER_MINUTE,
} from './friends-first-contact-parse';
import {
  listSocialGraph,
  recordSocialContact,
} from './social-graph.service';
import { pushFriendsGraphRefresh } from './friends-sync';

export {
  FirstContactError,
  parseFirstContactUsername,
  TELEGRAM_USERNAME_RE,
  FIRST_CONTACT_RATE_LIMIT_PER_MINUTE,
} from './friends-first-contact-parse';
export type { FirstContactErrorCode } from './friends-first-contact-parse';

const FIRST_CONTACT_RATE_WINDOW_SEC = 60;

export type FirstContactRegistered = {
  status: 'registered';
  friend: FriendCard;
  alreadyInGraph: boolean;
};

export type FirstContactUnregistered = {
  status: 'unregistered';
  username: string;
};

export type FirstContactResult =
  | FirstContactRegistered
  | FirstContactUnregistered;

export async function assertFirstContactRateLimit(
  userId: string,
): Promise<void> {
  const key = `rate:friends:first-contact:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, FIRST_CONTACT_RATE_WINDOW_SEC);
  }
  if (count > FIRST_CONTACT_RATE_LIMIT_PER_MINUTE) {
    throw new FirstContactError(
      'rate_limited',
      'too many lookups — try again shortly',
      429,
    );
  }
}

async function findFriendCardInGraph(
  userId: string,
  username: string,
  contactUserId: string,
): Promise<FriendCard | null> {
  const graph = await listSocialGraph(userId);
  const match =
    graph.find((c) => c.userId === contactUserId) ??
    graph.find(
      (c) => (c.username ?? '').toLowerCase() === username.toLowerCase(),
    );
  if (!match) return null;
  return sanitizeFriendCard(match);
}

/**
 * WHO first-contact v1: resolve exact username.
 * Registered → upsert SocialContact (WHO_FIRST_CONTACT), return FriendCard.
 * Unregistered → no SocialContact, no BanInvite.
 */
export async function resolveFirstContact(
  ownerId: string,
  rawUsername: unknown,
): Promise<FirstContactResult> {
  await assertFirstContactRateLimit(ownerId);
  const username = parseFirstContactUsername(rawUsername);

  const me = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { username: true },
  });
  if (
    me?.username &&
    normalizeUsername(me.username) === username
  ) {
    throw new FirstContactError('self', 'cannot add yourself', 400);
  }

  const target = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: {
      id: true,
      username: true,
      firstName: true,
      photoUrl: true,
    },
  });

  if (!target) {
    return { status: 'unregistered', username };
  }

  const existing = await prisma.socialContact.findUnique({
    where: {
      ownerId_contactUsername: {
        ownerId,
        contactUsername: username,
      },
    },
    select: { id: true },
  });
  const alreadyInGraph = !!existing;

  await recordSocialContact(ownerId, {
    username: target.username ? normalizeUsername(target.username) : username,
    contactUserId: target.id,
    firstName: target.firstName,
    photoUrl: target.photoUrl,
    source: 'WHO_FIRST_CONTACT',
  });

  const friend = await findFriendCardInGraph(ownerId, username, target.id);
  if (!friend) {
    throw new Error('first-contact: FriendCard missing after upsert');
  }

  void pushFriendsGraphRefresh(ownerId).catch(() => {});

  return {
    status: 'registered',
    friend,
    alreadyInGraph,
  };
}
