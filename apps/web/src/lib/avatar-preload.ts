import type { FriendCard } from '@98plus/shared';
import { rememberFriendAvatar, resolveFriendAvatarUrl } from './avatar-cache';
import { logAvatarStartup } from './avatar-startup-diag';
import { normalizeAvatarUrl, preloadAvatarUrls } from './avatar-url';

export type AvatarPreloadStatus = 'none' | 'loaded' | 'failed';

const statusByKey = new Map<string, AvatarPreloadStatus>();
const loadedUrls = new Set<string>();

const DEFAULT_TIMEOUT_MS = 1000;

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
  if (status === 'failed') return 'fallback';
  return undefined;
}

let onPreloadComplete: (() => void) | null = null;

export function setAvatarPreloadCompleteListener(cb: (() => void) | null): void {
  onPreloadComplete = cb;
}

function notifyPreloadComplete(): void {
  onPreloadComplete?.();
}

function isBrowserCachedImage(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  return img.complete && img.naturalWidth > 0;
}

/** Mark already-cached friend avatars as loaded before Who / strip paint. */
export function syncSeedCachedFriendAvatars(friends: FriendCard[]): void {
  if (typeof window === 'undefined') return;
  const urls: string[] = [];

  for (const friend of friends) {
    const key = friendAvatarKey(friend);
    const url = normalizeAvatarUrl(
      resolveFriendAvatarUrl(friend) ?? friend.avatarUrl ?? friend.photoUrl,
    );
    if (!url) {
      statusByKey.set(key, 'none');
      continue;
    }
    rememberFriendAvatar(friend.id, friend.userId, url);
    urls.push(url);
    if (loadedUrls.has(url) || isBrowserCachedImage(url)) {
      loadedUrls.add(url);
      statusByKey.set(key, 'loaded');
    }
  }

  preloadAvatarUrls(urls);
}

function preloadOne(
  url: string,
  timeoutMs: number,
): Promise<'loaded' | 'failed'> {
  if (typeof window === 'undefined') return Promise.resolve('failed');
  if (loadedUrls.has(url)) return Promise.resolve('loaded');

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    const finish = (result: 'loaded' | 'failed') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (result === 'loaded') loadedUrls.add(url);
      resolve(result);
    };

    const timer = window.setTimeout(() => finish('failed'), timeoutMs);
    img.onload = () => finish('loaded');
    img.onerror = () => finish('failed');
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      finish('loaded');
    }
  });
}

/** Preload friend avatars before arena paint; resolves fallback for missing/failed URLs. */
export async function preloadFriendAvatars(
  friends: FriendCard[],
  options?: { timeoutMs?: number; via?: string },
): Promise<void> {
  if (typeof window === 'undefined') return;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = performance.now();

  logAvatarStartup('[avatar-load-start]', {
    count: friends.length,
    via: options?.via ?? 'preload',
    timeoutMs,
  });

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
          preloadStatus: 'none',
          imgError: false,
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
        preloadStatus,
        imgError: preloadStatus === 'failed',
      });
    }),
  );

  logAvatarStartup('[avatar-data-ready]', {
    count: friends.length,
    via: options?.via ?? 'preload',
    preloadMs: Math.round(performance.now() - startedAt),
  });
  notifyPreloadComplete();
}

export { loadedUrls as preloadedAvatarUrls };
