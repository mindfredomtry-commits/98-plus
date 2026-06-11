import type { BanInteraction } from '@98plus/shared';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import type { QueuedOverlay } from '@/lib/overlay-queue';

export const REPLY_DEEPLINK_FAST_TIMEOUT_MS = 2000;

/** Placeholder copy while /open loads — real text replaces on hydrate. */
export const REPLY_DEEPLINK_SHELL_TEXT = '…';

export const REPLY_DEEPLINK_SHELL_SENDER_ID = 'reply-deeplink-shell';

export type ReplyFastCacheSource =
  | 'overlay-queue'
  | 'incoming-state'
  | 'buffered-incoming'
  | 'buffered-reply-deeplink'
  | 'startup-pending'
  | 'active-bans'
  | 'auth-claimed-incoming'
  | 'session-incoming'
  | 'caller-prefill';

export type ReplyPrefillResult = {
  hit: ReplyFastCacheHit | null;
  missReason: string;
};

export type ReplyFastCacheHit = {
  ban: BanInteraction;
  source: ReplyFastCacheSource;
};

export function isReplyDeeplinkShellBan(
  ban: BanInteraction | null | undefined,
): boolean {
  if (!ban) return false;
  if (ban.sender?.id === REPLY_DEEPLINK_SHELL_SENDER_ID) return true;
  if (ban.text === REPLY_DEEPLINK_SHELL_TEXT) return true;
  return false;
}

export function hasReplyFastDisplayText(
  ban: BanInteraction | null | undefined,
): boolean {
  const text = ban?.text?.trim();
  if (!text) return false;
  if (text === REPLY_DEEPLINK_SHELL_TEXT) return false;
  return true;
}

/** Buttons may act when ban id + receiver + real sender are known. */
export function canReplyFastEnableButtons(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!ban?.id || !viewerId) return false;
  if (ban.receiver?.id !== viewerId) return false;
  const senderId = ban.sender?.id;
  if (!senderId || senderId === REPLY_DEEPLINK_SHELL_SENDER_ID) return false;
  return true;
}

export type ReplyFastCacheLookup = {
  banId: string;
  viewerId: string;
  dismissed: ReadonlySet<string>;
  overlayQueue: readonly QueuedOverlay[];
  incomingBan: BanInteraction | null;
  bufferedIncoming: BanInteraction | null;
  bufferedReplyDeepLink: BanInteraction | null;
  pendingStartup: readonly QueuedOverlay[];
  activeBans: readonly BanInteraction[];
  claimedIncoming: BanInteraction | null;
  sessionIncoming: BanInteraction | null;
};

const SOURCE_PRIORITY: Record<ReplyFastCacheSource, number> = {
  'caller-prefill': -1,
  'overlay-queue': 0,
  'incoming-state': 1,
  'buffered-incoming': 2,
  'buffered-reply-deeplink': 3,
  'startup-pending': 4,
  'session-incoming': 5,
  'auth-claimed-incoming': 6,
  'active-bans': 7,
};

export function resolveReplyFastCachedBan(
  ctx: ReplyFastCacheLookup,
): ReplyFastCacheHit | null {
  const candidates: ReplyFastCacheHit[] = [];

  const push = (
    ban: BanInteraction | null | undefined,
    source: ReplyFastCacheSource,
  ) => {
    if (!ban?.id || ban.id !== ctx.banId) return;
    if (isReplyDeeplinkShellBan(ban)) return;
    if (ban.receiver?.id && ban.receiver.id !== ctx.viewerId) return;
    if (ctx.dismissed.has(ban.id)) return;
    if (!hasReplyFastDisplayText(ban)) return;
    if (
      !shouldShowIncomingBanModal(ban, ctx.viewerId, ctx.dismissed)
    ) {
      return;
    }
    candidates.push({ ban, source });
  };

  for (const q of ctx.overlayQueue) {
    if (q.kind === 'incoming') push(q.ban, 'overlay-queue');
  }
  push(ctx.incomingBan, 'incoming-state');
  push(ctx.bufferedIncoming, 'buffered-incoming');
  push(ctx.bufferedReplyDeepLink, 'buffered-reply-deeplink');
  for (const q of ctx.pendingStartup) {
    if (q.kind === 'incoming') push(q.ban, 'startup-pending');
  }
  push(ctx.sessionIncoming, 'session-incoming');
  push(ctx.claimedIncoming, 'auth-claimed-incoming');
  for (const b of ctx.activeBans) {
    push(b, 'active-bans');
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source],
  );
  return candidates[0] ?? null;
}

/** Read-only prefill: real text required; skips modal guard (display-only). */
export function resolveReplyPrefillBan(
  ctx: ReplyFastCacheLookup,
): ReplyPrefillResult {
  const candidates: ReplyFastCacheHit[] = [];

  const push = (
    ban: BanInteraction | null | undefined,
    source: ReplyFastCacheSource,
  ) => {
    if (!ban?.id || ban.id !== ctx.banId) return;
    if (isReplyDeeplinkShellBan(ban)) return;
    if (ctx.dismissed.has(ban.id)) return;
    if (!hasReplyFastDisplayText(ban)) return;
    if (ban.receiver?.id && ban.receiver.id !== ctx.viewerId) return;
    candidates.push({ ban, source });
  };

  for (const q of ctx.overlayQueue) {
    if (q.kind === 'incoming') push(q.ban, 'overlay-queue');
  }
  push(ctx.incomingBan, 'incoming-state');
  push(ctx.bufferedIncoming, 'buffered-incoming');
  push(ctx.bufferedReplyDeepLink, 'buffered-reply-deeplink');
  for (const q of ctx.pendingStartup) {
    if (q.kind === 'incoming') push(q.ban, 'startup-pending');
  }
  push(ctx.sessionIncoming, 'session-incoming');
  push(ctx.claimedIncoming, 'auth-claimed-incoming');
  for (const b of ctx.activeBans) {
    push(b, 'active-bans');
  }

  if (candidates.length === 0) {
    return { hit: null, missReason: 'no-local-ban-with-text' };
  }

  candidates.sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source],
  );
  return { hit: candidates[0] ?? null, missReason: '' };
}

export function buildReplyPrefillLookup(
  banId: string,
  viewerId: string,
  dismissed: ReadonlySet<string>,
  sources: Omit<ReplyFastCacheLookup, 'banId' | 'viewerId' | 'dismissed'>,
): ReplyFastCacheLookup {
  return {
    banId,
    viewerId,
    dismissed,
    ...sources,
  };
}

export function buildReplyDeeplinkShellBan(
  banId: string,
  viewerId: string,
): BanInteraction {
  const now = new Date().toISOString();
  return {
    id: banId,
    text: REPLY_DEEPLINK_SHELL_TEXT,
    status: 'pending',
    durationMinutes: 60,
    isIncoming: true,
    createdAt: now,
    expiresAt: null,
    checkDueAt: null,
    threadId: banId,
    sender: {
      id: REPLY_DEEPLINK_SHELL_SENDER_ID,
      telegramId: '',
      username: null,
      firstName: '',
      avatarUrl: null,
      photoUrl: null,
      aura: 'ember',
      auraLabel: '',
      energyPercent: 0,
      streak: 0,
      isOnboarded: true,
    },
    receiver: {
      id: viewerId,
      telegramId: '',
      username: null,
      firstName: '',
      avatarUrl: null,
      photoUrl: null,
      aura: 'ember',
      auraLabel: '',
      energyPercent: 0,
      streak: 0,
      isOnboarded: true,
    },
  };
}
