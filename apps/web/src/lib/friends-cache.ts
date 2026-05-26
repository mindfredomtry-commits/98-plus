import type { FriendCard } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';

function friendsCacheKey(userId: string): string {
  return `98plus_friends:${userId}`;
}

export function readFriendsCache(userId: string): FriendCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(friendsCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = coerceFriendList(
      Array.isArray(parsed) ? parsed : (parsed as { friends?: unknown })?.friends,
    );
    return list;
  } catch {
    return [];
  }
}

export function writeFriendsCache(userId: string, friends: FriendCard[]): void {
  if (typeof window === 'undefined') return;
  try {
    const safe = coerceFriendList(friends);
    localStorage.setItem(friendsCacheKey(userId), JSON.stringify(safe));
  } catch {
    /* ignore quota */
  }
}

export function clearFriendsCache(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(friendsCacheKey(userId));
  } catch {
    /* ignore */
  }
}
