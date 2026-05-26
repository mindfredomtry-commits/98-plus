import type { FriendCard, FriendSearchResult } from '@98plus/shared';
import { sanitizeFriendCard } from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { mapUser } from './user-mapper';
import { normalizeUsername } from './invite.service';
import { listSocialGraph, recordSocialContact } from './social-graph.service';
import { ensureDevFixturesForUser, isDevModeUser } from './dev-fixtures.service';

export async function listFriends(userId: string): Promise<FriendCard[]> {
  const t0 = Date.now();
  let stageAt = t0;
  const logStage = (stage: string) => {
    const now = Date.now();
    console.log('[friends-api]', {
      stage,
      ms: now - stageAt,
      totalMs: now - t0,
      userId,
    });
    stageAt = now;
  };

  try {
    logStage('start');
    if (await isDevModeUser(userId)) {
      await ensureDevFixturesForUser(userId);
      logStage('dev-fixtures');
    }
    const graph = await listSocialGraph(userId, {
      log: (stage, ms, totalMs) => {
        console.log('[friends-api]', { stage, ms, totalMs, userId });
      },
    });
    logStage('sanitize');
    const out = graph
      .map((c) => sanitizeFriendCard(c))
      .filter((c): c is FriendCard => c !== null);
    logStage('total');
    return out;
  } catch (err) {
    console.error('[friends] listSocialGraph failed', err);
    logStage('error');
    return [];
  }
}

export async function touchFriendAfterShare(
  userId: string,
  targetUsername: string,
  recentChallenge?: string,
) {
  await recordSocialContact(userId, {
    username: targetUsername,
    recentChallenge,
    source: 'SHARE_TARGET',
  });
}

export async function searchFriend(
  userId: string,
  query: string,
): Promise<FriendSearchResult> {
  const username = normalizeUsername(query);
  if (!username) {
    return {
      username: '',
      isRegistered: false,
      user: null,
      canSendBan: false,
    };
  }

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (user) {
    if (user.id === userId) {
      return {
        username,
        isRegistered: true,
        user: mapUser(user),
        canSendBan: false,
      };
    }
    return {
      username,
      isRegistered: true,
      user: mapUser(user),
      canSendBan: true,
    };
  }

  return {
    username,
    isRegistered: false,
    user: null,
    canSendBan: true,
  };
}
