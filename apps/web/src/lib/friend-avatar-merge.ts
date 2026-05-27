import type { FriendCard } from '@98plus/shared';
import {
  getCachedFriendAvatar,
  rememberFriendAvatar,
  resolveFriendAvatarUrl,
} from './avatar-cache';
import { friendAvatarKey } from './avatar-preload';
import { normalizeAvatarUrl } from './avatar-url';

function pickMergedAvatarUrl(
  next: FriendCard,
  prev?: FriendCard,
): string | null {
  const fromNext = normalizeAvatarUrl(next.avatarUrl ?? next.photoUrl);
  if (fromNext) return fromNext;
  const fromPrev = prev
    ? normalizeAvatarUrl(prev.avatarUrl ?? prev.photoUrl)
    : null;
  if (fromPrev) return fromPrev;
  return getCachedFriendAvatar(next.id, next.userId);
}

function withResolvedAvatar(friend: FriendCard, prev?: FriendCard): FriendCard {
  const avatar = pickMergedAvatarUrl(friend, prev);
  if (!avatar) return friend;
  rememberFriendAvatar(friend.id, friend.userId, avatar);
  return {
    ...friend,
    avatarUrl: avatar,
    photoUrl: avatar,
  };
}

/**
 * Network list wins for membership; per-friend avatarUrl never downgrades to null.
 * Empty network response does not wipe a non-empty previous list unless allowEmpty.
 */
export function mergeFriendsPreservingAvatars(
  prev: FriendCard[],
  next: FriendCard[],
  opts?: { allowEmpty?: boolean },
): FriendCard[] {
  for (const f of prev) {
    rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
  }
  if (!opts?.allowEmpty && next.length === 0 && prev.length > 0) {
    return prev.map((f) => withResolvedAvatar(f));
  }

  const prevByKey = new Map<string, FriendCard>();
  for (const f of prev) {
    prevByKey.set(friendAvatarKey(f), f);
  }

  return next.map((f) => {
    const prior = prevByKey.get(friendAvatarKey(f));
    return withResolvedAvatar(f, prior);
  });
}
