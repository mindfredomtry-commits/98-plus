import type { BanInteraction, BanResult, FriendCard, UserPublic } from '@98plus/shared';
import { findFriendByUsername } from '@98plus/shared';
import { preloadedAvatarUrls } from './avatar-preload';
import { normalizeAvatarUrl, preloadAvatarUrls } from './avatar-url';
import {
  getCachedFriendAvatar,
  rememberFriendAvatar,
  rememberUserAvatar,
  resolveFriendAvatarUrl,
  resolveUserAvatarUrl,
} from './avatar-cache';
import { enrichUserPublic } from './user-public-avatar';

export type OptimisticAvatarContext = {
  viewerId: string;
  viewer?: UserPublic | null;
  friends?: FriendCard[];
};

type AvatarResolveMeta = {
  fromIncoming: boolean;
  fromCache: boolean;
  fallbackUsed: boolean;
};

function findFriendForUser(
  user: UserPublic,
  friends: FriendCard[],
): FriendCard | null {
  if (user.id) {
    const byId = friends.find(
      (f) => f.userId === user.id || f.id === user.id,
    );
    if (byId) return byId;
  }
  const username = user.username?.replace(/^@/, '').trim();
  if (username) {
    return findFriendByUsername(friends, username) ?? null;
  }
  return null;
}

function resolveUserAvatarForOptimistic(
  user: UserPublic,
  ctx: OptimisticAvatarContext,
): { user: UserPublic; meta: AvatarResolveMeta } {
  const incomingUrl = normalizeAvatarUrl(user.avatarUrl ?? user.photoUrl);
  let url = incomingUrl;
  let fromIncoming = !!incomingUrl;
  let fromCache = false;

  if (!url && ctx.viewer?.id === user.id) {
    url = normalizeAvatarUrl(
      ctx.viewer.avatarUrl ?? ctx.viewer.photoUrl,
    );
    if (!url) url = resolveUserAvatarUrl(ctx.viewer);
    if (url) fromCache = true;
  }

  if (!url && ctx.friends?.length) {
    const friend = findFriendForUser(user, ctx.friends);
    if (friend) {
      url = resolveFriendAvatarUrl(friend);
      if (url) {
        fromCache = true;
        rememberFriendAvatar(friend.id, friend.userId, url);
      }
    }
  }

  if (!url && user.id) {
    url =
      resolveUserAvatarUrl(user) ??
      getCachedFriendAvatar(user.id, user.id);
    if (url) fromCache = true;
  }

  if (url && user.id) {
    rememberUserAvatar(user.id, url);
  }

  const fallbackUsed = !url;
  const withUrl: UserPublic = url
    ? { ...user, avatarUrl: url, photoUrl: url }
    : user;

  return {
    user: enrichUserPublic(withUrl),
    meta: { fromIncoming, fromCache, fallbackUsed },
  };
}

function patchBanParticipantsFromContext(
  ban: BanInteraction,
  ctx: OptimisticAvatarContext,
): BanInteraction {
  let next = ban;
  const friends = ctx.friends ?? [];

  if (!ban.sender?.id && friends.length > 0) {
    const username = ban.sender?.username?.replace(/^@/, '').trim();
    if (username) {
      const friend = findFriendByUsername(friends, username);
      const senderId = friend?.userId ?? friend?.id;
      if (senderId && ban.sender) {
        const friendUrl = friend ? resolveFriendAvatarUrl(friend) : null;
        next = {
          ...next,
          sender: {
            ...ban.sender,
            id: senderId,
            avatarUrl: ban.sender.avatarUrl ?? friend?.avatarUrl ?? friendUrl,
            photoUrl: ban.sender.photoUrl ?? friend?.photoUrl ?? friendUrl,
          },
        };
      }
    }
  }

  if (ctx.viewer?.id && next.receiver?.id === ctx.viewer.id) {
    const viewerUrl = normalizeAvatarUrl(
      ctx.viewer.avatarUrl ?? ctx.viewer.photoUrl,
    );
    if (viewerUrl) {
      next = {
        ...next,
        receiver: {
          ...next.receiver,
          avatarUrl: next.receiver.avatarUrl ?? viewerUrl,
          photoUrl: next.receiver.photoUrl ?? viewerUrl,
        },
      };
    }
  }

  return next;
}

function logOptimisticOverboardAvatars(
  banId: string,
  sender: { url: string | null; meta: AvatarResolveMeta },
  receiver: { url: string | null; meta: AvatarResolveMeta },
): void {
  console.log('[OPTIMISTIC OVERBOARD AVATAR]');
  console.log('[OPTIMISTIC OVERBOARD AVATAR] banId=', banId);
  console.log('[OPTIMISTIC OVERBOARD AVATAR] senderAvatar=', sender.url ?? '—');
  console.log('[OPTIMISTIC OVERBOARD AVATAR] receiverAvatar=', receiver.url ?? '—');
  console.log('[OPTIMISTIC OVERBOARD AVATAR] fromIncoming=', {
    sender: sender.meta.fromIncoming,
    receiver: receiver.meta.fromIncoming,
  });
  console.log('[OPTIMISTIC OVERBOARD AVATAR] fromCache=', {
    sender: sender.meta.fromCache,
    receiver: receiver.meta.fromCache,
  });
  console.log('[OPTIMISTIC OVERBOARD AVATAR] fallbackUsed=', {
    sender: sender.meta.fallbackUsed,
    receiver: receiver.meta.fallbackUsed,
  });
}

export function prepareOptimisticOverboardParticipants(
  ban: BanInteraction,
  ctx: OptimisticAvatarContext,
): { sender: UserPublic; receiver: UserPublic } {
  const patched = patchBanParticipantsFromContext(ban, ctx);
  const senderResolved = resolveUserAvatarForOptimistic(patched.sender, ctx);
  const receiverResolved = resolveUserAvatarForOptimistic(patched.receiver, ctx);

  logOptimisticOverboardAvatars(patched.id, {
    url: resolveUserAvatarUrl(senderResolved.user),
    meta: senderResolved.meta,
  }, {
    url: resolveUserAvatarUrl(receiverResolved.user),
    meta: receiverResolved.meta,
  });

  const preloadTargets = [
    senderResolved.user.avatarUrl,
    senderResolved.user.photoUrl,
    receiverResolved.user.avatarUrl,
    receiverResolved.user.photoUrl,
  ];
  preloadAvatarUrls(preloadTargets);
  for (const raw of preloadTargets) {
    const normalized = normalizeAvatarUrl(raw);
    if (normalized) preloadedAvatarUrls.add(normalized);
  }

  return {
    sender: senderResolved.user,
    receiver: receiverResolved.user,
  };
}

function mergeUserPublicPreserveAvatar(
  prev: UserPublic,
  next: UserPublic,
): UserPublic {
  const prevUrl = resolveUserAvatarUrl(prev);
  const nextUrl = resolveUserAvatarUrl(next);
  const url = nextUrl ?? prevUrl;
  if (!url) return enrichUserPublic(next);
  return enrichUserPublic({ ...next, avatarUrl: url, photoUrl: url });
}

/** Keep optimistic avatar URLs when API sync arrives slightly later. */
export function mergeOverboardResultUsers(
  prev: BanResult,
  next: BanResult,
): BanResult {
  const sender = mergeUserPublicPreserveAvatar(prev.sender, next.sender);
  const receiver = mergeUserPublicPreserveAvatar(prev.receiver, next.receiver);
  const opponent =
    next.viewerId === sender.id
      ? receiver
      : next.viewerId === receiver.id
        ? sender
        : mergeUserPublicPreserveAvatar(prev.opponent, next.opponent);

  return {
    ...next,
    sender,
    receiver,
    opponent,
  };
}
