import type { FriendCard } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';

const CACHE_KEY = '98plus_last_friends';

export function readFriendsCache(): FriendCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
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

export function writeFriendsCache(friends: FriendCard[]): void {
  if (typeof window === 'undefined') return;
  try {
    const safe = coerceFriendList(friends);
    localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
  } catch {
    /* ignore quota */
  }
}

export function clearFriendsCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
