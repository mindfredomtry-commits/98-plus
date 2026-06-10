import type { FriendCard } from '@98plus/shared';
import {
  getCachedFriendAvatar,
  rememberFriendAvatar,
  resolveFriendAvatarUrl,
} from './avatar-cache';

export function enrichFriendCard(friend: FriendCard): FriendCard {
  const avatar =
    resolveFriendAvatarUrl(friend) ??
    getCachedFriendAvatar(friend.id, friend.userId);
  if (!avatar) return friend;
  rememberFriendAvatar(friend.id, friend.userId, avatar);
  return {
    ...friend,
    avatarUrl: avatar,
    photoUrl: avatar,
  };
}

/** Never downgrade avatarUrl to null when a prior value exists for the same friend. */
export function mergeFriendsPreservingAvatars(
  prev: FriendCard[],
  next: FriendCard[],
  opts?: { allowEmpty?: boolean },
): FriendCard[] {
  for (const f of prev) {
    rememberFriendAvatar(f.id, f.userId, f.avatarUrl ?? f.photoUrl);
  }
  if (!opts?.allowEmpty && next.length === 0 && prev.length > 0) {
    return prev.map(enrichFriendCard);
  }
  return next.map(enrichFriendCard);
}

export function enrichFriendsForWho(friends: FriendCard[]): FriendCard[] {
  return friends.map(enrichFriendCard);
}
