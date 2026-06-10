import type { FriendCard } from '@98plus/shared';
import { normalizeAvatarUrl } from './avatar-url';
import {
  getCachedFriendAvatar,
  rememberFriendAvatar,
  resolveFriendAvatarUrl,
} from './avatar-cache';
import {
  getAvatarReadyState,
  isAvatarUrlPreloaded,
} from './avatar-preload';
import { enrichFriendCard } from './friend-avatar-merge';

export type WhoAvatarDisplay = {
  friend: FriendCard;
  avatarUrl: string | null;
  readyState?: 'photo' | 'fallback';
  fromFriends: boolean;
  fromCache: boolean;
  preloaded: boolean;
  fallbackUsed: boolean;
};

export function resolveWhoAvatarDisplay(friend: FriendCard): WhoAvatarDisplay {
  const enriched = enrichFriendCard(friend);
  const fromFields = normalizeAvatarUrl(
    friend.avatarUrl ?? friend.photoUrl,
  );
  const avatarUrl =
    resolveFriendAvatarUrl(enriched) ??
    getCachedFriendAvatar(enriched.id, enriched.userId);
  const fromFriends = !!fromFields;
  const fromCache = !fromFriends && !!avatarUrl;

  if (avatarUrl) {
    rememberFriendAvatar(enriched.id, enriched.userId, avatarUrl);
  }

  const preloaded = avatarUrl ? isAvatarUrlPreloaded(avatarUrl) : false;
  const readyState =
    getAvatarReadyState(enriched) ?? (preloaded ? 'photo' : undefined);

  return {
    friend: avatarUrl
      ? { ...enriched, avatarUrl, photoUrl: avatarUrl }
      : enriched,
    avatarUrl,
    readyState,
    fromFriends,
    fromCache,
    preloaded,
    fallbackUsed: !avatarUrl,
  };
}

export function logWhoAvatar(display: WhoAvatarDisplay): void {
  if (process.env.NODE_ENV === 'production') return;
  const userId = display.friend.userId ?? display.friend.id ?? '—';
  console.log('[WHO AVATAR]');
  console.log('[WHO AVATAR] userId=', userId);
  console.log('[WHO AVATAR] avatarUrl=', display.avatarUrl ?? '—');
  console.log('[WHO AVATAR] fromFriends=', display.fromFriends);
  console.log('[WHO AVATAR] fromCache=', display.fromCache);
  console.log('[WHO AVATAR] preloaded=', display.preloaded);
  console.log('[WHO AVATAR] fallbackUsed=', display.fallbackUsed);
}
