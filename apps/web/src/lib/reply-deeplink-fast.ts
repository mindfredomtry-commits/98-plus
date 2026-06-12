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
  | 'auth-reply-preview'
  | 'start-param-preview'
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

/** Sender identity for display — id, @username, or firstName; avatar uses letter fallback in UI. */
export function hasIncomingSenderIdentity(
  sender: BanInteraction['sender'] | null | undefined,
): boolean {
  if (!sender) return false;
  const senderId = sender.id?.trim();
  if (senderId && senderId !== REPLY_DEEPLINK_SHELL_SENDER_ID) return true;
  const username = sender.username?.replace(/^@/, '').trim();
  if (username) return true;
  return Boolean(sender.firstName?.trim());
}

/** Optional timing hint — card renders without it; used for diagnostics only. */
export function hasIncomingDurationHint(
  ban: BanInteraction | null | undefined,
): boolean {
  if (!ban) return false;
  if (typeof ban.durationMinutes === 'number' && ban.durationMinutes > 0) {
    return true;
  }
  if (ban.expiresAt) return true;
  if (ban.createdAt) return true;
  return false;
}

export function getIncomingCardNotReadyReason(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
): string {
  if (!ban) return 'no-ban';
  if (!viewerId) return 'no-viewer';
  if (!ban.id) return 'no-id';
  if (isReplyDeeplinkShellBan(ban)) return 'shell-ban';
  if (!hasReplyFastDisplayText(ban)) return 'no-text';
  if (!hasIncomingSenderIdentity(ban.sender)) return 'no-sender-identity';
  return 'ok';
}

/** Display-ready: real id + text + sender identity; no shell; avatar/duration optional. */
export function isIncomingCardDisplayReady(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  return getIncomingCardNotReadyReason(ban, viewerId) === 'ok';
}

/** @deprecated Use isIncomingCardDisplayReady */
export const isIncomingCardFullyReady = isIncomingCardDisplayReady;

function incomingBanDisplayScore(ban: BanInteraction): number {
  let score = 0;
  if (hasReplyFastDisplayText(ban)) score += 8;
  if (
    ban.sender?.id &&
    ban.sender.id !== REPLY_DEEPLINK_SHELL_SENDER_ID
  ) {
    score += 4;
  }
  if (ban.sender?.username?.trim()) score += 2;
  if (ban.sender?.firstName?.trim()) score += 1;
  if (ban.sender?.avatarUrl || ban.sender?.photoUrl) score += 1;
  if (hasIncomingDurationHint(ban)) score += 1;
  return score;
}

/** Pick best hydrated ban from candidates — never returns shell placeholders. */
export function pickIncomingCardDisplayBan(
  candidates: readonly (BanInteraction | null | undefined)[],
  viewerId: string | null | undefined,
): BanInteraction | null {
  let best: BanInteraction | null = null;
  let bestScore = -1;

  for (const ban of candidates) {
    if (!ban?.id || isReplyDeeplinkShellBan(ban)) continue;
    if (!isIncomingCardDisplayReady(ban, viewerId)) continue;
    const score = incomingBanDisplayScore(ban);
    if (score > bestScore) {
      best = ban;
      bestScore = score;
    }
  }

  return best;
}

let lastIncomingCardDebugKey = '';

export function logIncomingCardDisplayState(
  displayBan: BanInteraction | null | undefined,
  probeBan: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
): void {
  const key = displayBan
    ? `exists:${displayBan.id}`
    : `null:${probeBan?.id ?? 'none'}:${getIncomingCardNotReadyReason(probeBan, viewerId)}`;
  if (key === lastIncomingCardDebugKey) return;
  lastIncomingCardDebugKey = key;

  if (displayBan?.id) {
    console.log('[incoming-card-debug] displayBan exists', {
      banId: displayBan.id,
      textLen: displayBan.text?.length ?? 0,
      senderId: displayBan.sender?.id ?? null,
      hasDurationHint: hasIncomingDurationHint(displayBan),
    });
    return;
  }

  const reason = getIncomingCardNotReadyReason(probeBan, viewerId);
  console.log('[incoming-card-debug] displayBan null', {
    probeBanId: probeBan?.id ?? null,
    reason,
  });
  if (reason !== 'ok' && reason !== 'no-ban') {
    console.log('[incoming-card-debug] ready false reason:', reason, {
      banId: probeBan?.id ?? null,
      shell: isReplyDeeplinkShellBan(probeBan),
      hasText: hasReplyFastDisplayText(probeBan),
      hasSender: hasIncomingSenderIdentity(probeBan?.sender),
      hasDurationHint: hasIncomingDurationHint(probeBan),
    });
  }
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
  replyDeeplinkPreview: BanInteraction | null;
  startParamPreviewBan: BanInteraction | null;
  sessionIncoming: BanInteraction | null;
};

const SOURCE_PRIORITY: Record<ReplyFastCacheSource, number> = {
  'caller-prefill': -1,
  'start-param-preview': 0,
  'auth-reply-preview': 1,
  'overlay-queue': 2,
  'incoming-state': 3,
  'buffered-incoming': 4,
  'buffered-reply-deeplink': 5,
  'startup-pending': 6,
  'session-incoming': 7,
  'auth-claimed-incoming': 8,
  'active-bans': 9,
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

  push(ctx.startParamPreviewBan, 'start-param-preview');
  push(ctx.replyDeeplinkPreview, 'auth-reply-preview');
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

  push(ctx.startParamPreviewBan, 'start-param-preview');
  push(ctx.replyDeeplinkPreview, 'auth-reply-preview');
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

export type ReplyPrefillSourceCheck = {
  source: string;
  count: number;
  matched: boolean;
  hasText: boolean;
  hasSender: boolean;
  sampleKeys: string[];
  failReason: string;
};

function sampleBanKeys(ban: BanInteraction | null | undefined): string[] {
  if (!ban) return [];
  return Object.keys(ban).slice(0, 16);
}

function inspectBanForPrefill(
  ban: BanInteraction | null | undefined,
  ctx: ReplyFastCacheLookup,
): Pick<
  ReplyPrefillSourceCheck,
  'matched' | 'hasText' | 'hasSender' | 'sampleKeys' | 'failReason'
> {
  if (!ban) {
    return {
      matched: false,
      hasText: false,
      hasSender: false,
      sampleKeys: [],
      failReason: 'empty',
    };
  }
  const sampleKeys = sampleBanKeys(ban);
  if (!ban.id) {
    return {
      matched: false,
      hasText: false,
      hasSender: false,
      sampleKeys,
      failReason: 'no-id',
    };
  }
  if (ban.id !== ctx.banId) {
    return {
      matched: false,
      hasText: hasReplyFastDisplayText(ban),
      hasSender: canReplyFastEnableButtons(ban, ctx.viewerId),
      sampleKeys,
      failReason: 'banId-mismatch',
    };
  }
  if (isReplyDeeplinkShellBan(ban)) {
    return {
      matched: true,
      hasText: false,
      hasSender: false,
      sampleKeys,
      failReason: 'shell-ban',
    };
  }
  if (ctx.dismissed.has(ban.id)) {
    return {
      matched: true,
      hasText: hasReplyFastDisplayText(ban),
      hasSender: canReplyFastEnableButtons(ban, ctx.viewerId),
      sampleKeys,
      failReason: 'dismissed',
    };
  }
  if (!hasReplyFastDisplayText(ban)) {
    return {
      matched: true,
      hasText: false,
      hasSender: canReplyFastEnableButtons(ban, ctx.viewerId),
      sampleKeys,
      failReason: 'no-text',
    };
  }
  if (ban.receiver?.id && ban.receiver.id !== ctx.viewerId) {
    return {
      matched: true,
      hasText: true,
      hasSender: false,
      sampleKeys,
      failReason: 'receiver-mismatch',
    };
  }
  return {
    matched: true,
    hasText: true,
    hasSender: canReplyFastEnableButtons(ban, ctx.viewerId),
    sampleKeys,
    failReason: 'ok',
  };
}

function diagnoseListSource(
  source: string,
  bans: readonly BanInteraction[],
  ctx: ReplyFastCacheLookup,
): ReplyPrefillSourceCheck {
  const count = bans.length;
  const matchedBan = bans.find((b) => b?.id === ctx.banId) ?? null;
  const inspect = inspectBanForPrefill(matchedBan ?? bans[0] ?? null, ctx);
  return {
    source,
    count,
    matched: matchedBan != null,
    hasText: matchedBan ? hasReplyFastDisplayText(matchedBan) : false,
    hasSender: matchedBan
      ? canReplyFastEnableButtons(matchedBan, ctx.viewerId)
      : false,
    sampleKeys: inspect.sampleKeys,
    failReason:
      count === 0 ? 'empty' : matchedBan ? inspect.failReason : 'banId-mismatch',
  };
}

function diagnoseSingleSource(
  source: string,
  ban: BanInteraction | null,
  ctx: ReplyFastCacheLookup,
): ReplyPrefillSourceCheck {
  const inspect = inspectBanForPrefill(ban, ctx);
  return {
    source,
    count: ban ? 1 : 0,
    matched: inspect.matched,
    hasText: ban ? hasReplyFastDisplayText(ban) : false,
    hasSender: ban ? canReplyFastEnableButtons(ban, ctx.viewerId) : false,
    sampleKeys: inspect.sampleKeys,
    failReason: inspect.failReason,
  };
}

/** Read-only diagnostics for [REPLY PREFILL MISS] — no lookup behavior change. */
export function diagnoseReplyPrefillSources(
  ctx: ReplyFastCacheLookup,
): ReplyPrefillSourceCheck[] {
  const overlayIncoming = ctx.overlayQueue
    .filter((q) => q.kind === 'incoming')
    .map((q) => q.ban);
  const pendingIncoming = ctx.pendingStartup
    .filter((q) => q.kind === 'incoming')
    .map((q) => q.ban);

  return [
    diagnoseListSource('overlayQueue', overlayIncoming, ctx),
    diagnoseSingleSource('incomingBan', ctx.incomingBan, ctx),
    diagnoseSingleSource('bufferedIncoming', ctx.bufferedIncoming, ctx),
    diagnoseSingleSource('bufferedReplyDeepLink', ctx.bufferedReplyDeepLink, ctx),
    diagnoseListSource('pendingStartup', pendingIncoming, ctx),
    diagnoseSingleSource('lastSessionIncomingRef', ctx.sessionIncoming, ctx),
    diagnoseSingleSource('auth.boot.claimedIncoming', ctx.claimedIncoming, ctx),
    diagnoseSingleSource('startParamPreviewBan', ctx.startParamPreviewBan, ctx),
    diagnoseSingleSource('auth.replyDeeplinkPreview', ctx.replyDeeplinkPreview, ctx),
    diagnoseListSource('activeBans', ctx.activeBans, ctx),
  ];
}

export function buildReplyPrefillMissDetail(
  banId: string,
  checks: readonly ReplyPrefillSourceCheck[],
): string {
  const sourceSummary = checks
    .map((c) => `${c.source}(${c.failReason})`)
    .join(', ');
  return `no-local-ban-with-text; banId=${banId}; sources: ${sourceSummary}`;
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
