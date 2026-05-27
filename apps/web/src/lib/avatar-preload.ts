import type { FriendCard } from '@98plus/shared';
import { normalizeAvatarUrl } from './avatar-url';

export type AvatarPreloadStatus = 'none' | 'loaded' | 'failed' | 'timeout';

const statusByKey = new Map<string, AvatarPreloadStatus>();
const loadedUrls = new Set<string>();

const DEFAULT_TIMEOUT_MS = 3000;

/** Arena first paint waits for preload with this ceiling (slow CDN → final fallback). */
export const ARENA_AVATAR_PRELOAD_MS = DEFAULT_TIMEOUT_MS;

export function friendAvatarKey(friend: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
}): string {
  if (friend.userId) return `u:${friend.userId}`;
  if (friend.id) return `f:${friend.id}`;
  return `n:${(friend.username ?? 'unknown').toLowerCase()}`;
}

export function clearAvatarPreloadState(): void {
  statusByKey.clear();
  loadedUrls.clear();
}

export function isAvatarUrlPreloaded(url: string | null | undefined): boolean {
  const normalized = normalizeAvatarUrl(url);
  return normalized ? loadedUrls.has(normalized) : false;
}

export function getAvatarPreloadStatus(friend: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
}): AvatarPreloadStatus {
  return statusByKey.get(friendAvatarKey(friend)) ?? 'none';
}

export function getAvatarReadyState(
  friend: FriendCard,
): 'photo' | 'fallback' | undefined {
  const status = getAvatarPreloadStatus(friend);
  if (status === 'loaded') return 'photo';
  if (status === 'failed' || status === 'timeout' || status === 'none') {
    return 'fallback';
  }
  return undefined;
}

/** True when every friend has a resolved preload status (arena-safe to paint). */
export function areFriendAvatarsReady(friends: FriendCard[]): boolean {
  if (friends.length === 0) return true;
  return friends.every((f) => {
    const s = getAvatarPreloadStatus(f);
    return s === 'loaded' || s === 'failed' || s === 'timeout' || s === 'none';
  });
}

function preloadOne(
  url: string,
  timeoutMs: number,
): Promise<'loaded' | 'failed' | 'timeout'> {
  if (typeof window === 'undefined') return Promise.resolve('failed');
  if (loadedUrls.has(url)) return Promise.resolve('loaded');

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    const finish = (result: 'loaded' | 'failed' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (result === 'loaded') loadedUrls.add(url);
      resolve(result);
    };

    const timer = window.setTimeout(() => finish('timeout'), timeoutMs);
    img.onload = () => finish('loaded');
    img.onerror = () => finish('failed');
    img.src = url;
  });
}

/** Preload friend avatars before arena paint; resolves fallback for missing/failed URLs. */
export async function preloadFriendAvatars(
  friends: FriendCard[],
  options?: { timeoutMs?: number },
): Promise<void> {
  if (typeof window === 'undefined') return;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await Promise.allSettled(
    friends.map(async (f) => {
      const key = friendAvatarKey(f);
      const userId = f.userId ?? f.id ?? null;
      const name = f.firstName || f.username || '—';
      const avatarUrl = normalizeAvatarUrl(f.avatarUrl ?? f.photoUrl);

      if (!avatarUrl) {
        statusByKey.set(key, 'none');
        console.log('[avatar-debug]', {
          userId,
          name,
          username: f.username,
          avatarUrl: null,
          hasAvatarUrl: false,
          preloadStatus: 'none',
          reason: 'no-url',
        });
        return;
      }

      const preloadStatus = await preloadOne(avatarUrl, timeoutMs);
      statusByKey.set(key, preloadStatus);
      console.log('[avatar-debug]', {
        userId,
        name,
        username: f.username,
        avatarUrl,
        hasAvatarUrl: true,
        preloadStatus,
        reason:
          preloadStatus === 'loaded'
            ? 'ok'
            : preloadStatus === 'timeout'
              ? 'timeout'
              : 'img-error',
      });
    }),
  );
}

export { loadedUrls as preloadedAvatarUrls };
