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

export type OptimisticOverboardBuildContext = OptimisticAvatarContext & {
  /** verifiedBan, incomingBan, session active row — merged for incomplete WS payloads */
  fallbackBans?: BanInteraction[];
};

type BanTextFields = {
  text?: string | null;
  title?: string | null;
  banText?: string | null;
};

export type OptimisticOverboardBuildDiagnostics = {
  missingBanId: boolean;
  missingText: boolean;
  missingSenderId: boolean;
  missingReceiverId: boolean;
  missingParticipants: boolean;
  reason: string | null;
};

const OPT_ID_PREFIX = 'opt:';

function pickBanText(...sources: (BanTextFields | null | undefined)[]): string | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of ['text', 'title', 'banText'] as const) {
      const value = source[key]?.trim();
      if (value) return value;
    }
  }
  return null;
}

function mergeBanSources(
  primary: BanInteraction,
  fallbacks: BanInteraction[],
): BanInteraction {
  const sources = [primary, ...fallbacks.filter((b) => b.id === primary.id)];
  const text = pickBanText(...sources) ?? primary.text?.trim() ?? '';
  const sender =
    sources.find(
      (s) =>
        s.sender?.id?.trim() ||
        s.sender?.username?.trim() ||
        s.sender?.firstName?.trim() ||
        s.sender?.telegramId?.trim(),
    )?.sender ?? primary.sender;
  const receiver =
    sources.find(
      (s) =>
        s.receiver?.id?.trim() ||
        s.receiver?.username?.trim() ||
        s.receiver?.firstName?.trim() ||
        s.receiver?.telegramId?.trim(),
    )?.receiver ?? primary.receiver;

  return {
    ...primary,
    text,
    sender: sender ?? primary.sender,
    receiver: receiver ?? primary.receiver,
  };
}

function syntheticParticipantId(
  banId: string,
  role: 'sender' | 'receiver',
  hint?: string | null,
): string {
  const trimmed = hint?.trim();
  if (trimmed) return trimmed;
  return `${OPT_ID_PREFIX}${role}:${banId}`;
}

function hasDisplayIdentity(user: UserPublic | null | undefined): boolean {
  if (!user?.id?.trim()) return false;
  return Boolean(
    user.firstName?.trim() ||
      user.username?.replace(/^@/, '').trim() ||
      user.telegramId?.trim(),
  );
}

function coalesceUserPublic(
  partial: Partial<UserPublic> | null | undefined,
  fallbackId: string,
  ctx: OptimisticAvatarContext,
): UserPublic {
  const id =
    partial?.id?.trim() ||
    partial?.telegramId?.trim() ||
    fallbackId.trim();
  const firstName =
    partial?.firstName?.trim() ||
    partial?.username?.replace(/^@/, '').trim() ||
    'Игрок';
  const base: UserPublic = {
    id,
    telegramId: partial?.telegramId?.trim() || id,
    username: partial?.username ?? null,
    firstName,
    lastName: partial?.lastName ?? null,
    avatarUrl: partial?.avatarUrl ?? partial?.photoUrl ?? null,
    photoUrl: partial?.photoUrl ?? partial?.avatarUrl ?? null,
    aura: partial?.aura ?? 'stable',
    auraLabel: partial?.auraLabel ?? '',
    energyPercent: partial?.energyPercent ?? 50,
    streak: partial?.streak ?? 0,
    isOnboarded: partial?.isOnboarded ?? true,
  };
  return resolveUserAvatarForOptimistic(base, ctx).user;
}

function patchSenderFromFriends(
  sender: Partial<UserPublic> | null | undefined,
  friends: FriendCard[],
): Partial<UserPublic> | null | undefined {
  if (!sender || sender.id?.trim()) return sender;
  const username = sender.username?.replace(/^@/, '').trim();
  if (!username) return sender;
  const friend = findFriendByUsername(friends, username);
  const senderId = friend?.userId ?? friend?.id;
  if (!senderId) return sender;
  const friendUrl = friend ? resolveFriendAvatarUrl(friend) : null;
  return {
    ...sender,
    id: senderId,
    avatarUrl: sender.avatarUrl ?? friend?.avatarUrl ?? friendUrl,
    photoUrl: sender.photoUrl ?? friend?.photoUrl ?? friendUrl,
  };
}

function resolveOptimisticSender(
  ban: BanInteraction,
  banId: string,
  ctx: OptimisticOverboardBuildContext,
): UserPublic {
  const friends = ctx.friends ?? [];
  const patched = patchSenderFromFriends(ban.sender, friends) ?? ban.sender;
  return coalesceUserPublic(
    patched,
    syntheticParticipantId(banId, 'sender'),
    ctx,
  );
}

function resolveOptimisticReceiver(
  ban: BanInteraction,
  banId: string,
  ctx: OptimisticOverboardBuildContext,
): UserPublic {
  if (ban.isIncoming !== false && ctx.viewerId) {
    const viewerPartial: Partial<UserPublic> = {
      ...(ban.receiver ?? {}),
      ...(ctx.viewer ?? {}),
      id: ctx.viewerId,
    };
    return coalesceUserPublic(
      viewerPartial,
      syntheticParticipantId(banId, 'receiver', ctx.viewerId),
      ctx,
    );
  }

  if (ctx.viewerId && ban.receiver?.id === ctx.viewerId && ctx.viewer) {
    return coalesceUserPublic(
      { ...ctx.viewer, ...ban.receiver, id: ctx.viewerId },
      ctx.viewerId,
      ctx,
    );
  }

  const receiverPartial = ban.receiver ?? ctx.viewer ?? null;
  const receiverId =
    receiverPartial?.id?.trim() ||
    (ctx.viewerId && ban.receiver?.id === ctx.viewerId ? ctx.viewerId : null);
  return coalesceUserPublic(
    receiverId ? { ...receiverPartial, id: receiverId } : receiverPartial,
    syntheticParticipantId(banId, 'receiver', receiverId ?? ctx.viewerId),
    ctx,
  );
}

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
  user: UserPublic | null | undefined,
  ctx: OptimisticAvatarContext,
): { user: UserPublic; meta: AvatarResolveMeta } {
  if (!user?.id?.trim()) {
    const fallback = coalesceUserPublic(user, `${OPT_ID_PREFIX}unknown`, ctx);
    return {
      user: fallback,
      meta: { fromIncoming: false, fromCache: false, fallbackUsed: true },
    };
  }
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

export function diagnoseOptimisticOverboardParticipants(
  ban: BanInteraction,
  ctx: OptimisticOverboardBuildContext,
): OptimisticOverboardBuildDiagnostics {
  const banId = ban.id?.trim() ?? '';
  const merged = mergeBanSources(ban, ctx.fallbackBans ?? []);
  const text = pickBanText(merged, ...(ctx.fallbackBans ?? [])) ?? merged.text?.trim();
  const sender = resolveOptimisticSender(merged, banId, ctx);
  const receiver = resolveOptimisticReceiver(merged, banId, ctx);

  const missingBanId = !banId;
  const missingText = !text;
  const missingSenderId = !ban.sender?.id?.trim() && !merged.sender?.id?.trim();
  const missingReceiverId =
    !ban.receiver?.id?.trim() && !merged.receiver?.id?.trim();
  const missingParticipants =
    !hasDisplayIdentity(sender) || !hasDisplayIdentity(receiver);

  let reason: string | null = null;
  if (missingBanId) reason = 'missing-ban-id';
  else if (missingText) reason = 'missing-text';
  else if (missingParticipants) reason = 'missing-participants';
  return {
    missingBanId,
    missingText,
    missingSenderId,
    missingReceiverId,
    missingParticipants,
    reason,
  };
}

export function prepareOptimisticOverboardParticipants(
  ban: BanInteraction,
  ctx: OptimisticOverboardBuildContext = { viewerId: '' },
): { sender: UserPublic; receiver: UserPublic; mergedBan: BanInteraction } {
  const merged = mergeBanSources(ban, ctx.fallbackBans ?? []);
  const patched = patchBanParticipantsFromContext(merged, ctx);
  const banId = patched.id?.trim() ?? merged.id;
  const sender = resolveOptimisticSender(patched, banId, ctx);
  const receiver = resolveOptimisticReceiver(patched, banId, ctx);

  logOptimisticOverboardAvatars(banId, {
    url: resolveUserAvatarUrl(sender),
    meta: { fromIncoming: false, fromCache: false, fallbackUsed: false },
  }, {
    url: resolveUserAvatarUrl(receiver),
    meta: { fromIncoming: false, fromCache: false, fallbackUsed: false },
  });

  const preloadTargets = [
    sender.avatarUrl,
    sender.photoUrl,
    receiver.avatarUrl,
    receiver.photoUrl,
  ];
  preloadAvatarUrls(preloadTargets);
  for (const raw of preloadTargets) {
    const normalized = normalizeAvatarUrl(raw);
    if (normalized) preloadedAvatarUrls.add(normalized);
  }

  return {
    sender,
    receiver,
    mergedBan: {
      ...patched,
      text: pickBanText(patched, ...(ctx.fallbackBans ?? [])) ?? patched.text,
      sender,
      receiver,
    },
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
