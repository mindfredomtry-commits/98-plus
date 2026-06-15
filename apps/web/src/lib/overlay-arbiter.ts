import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from './overlay-queue';
import { overlayQueueKey } from './overlay-queue';
import { normalizeId } from './normalize-json';

/** Auto-show TTL for incoming / check / result overlays. */
export const OVERLAY_AUTO_SHOW_TTL_MS = 10 * 60 * 1000;

/** Pause before showing next queued overlay after dismiss. */
export const OVERLAY_SHOW_NEXT_DELAY_MS = 400;

export type OverlayEventSource = 'ws' | 'poll' | 'session' | 'deeplink';

export type OverlayArbiterLogStage =
  | 'enqueue'
  | 'dedup-skip'
  | 'ttl-skip'
  | 'blocked-by-deeplink'
  | 'blocked-by-current-overlay'
  | 'show'
  | 'dismiss'
  | 'show-next';

export type OverlayArbiterContext = {
  viewerId: string | null;
  deepLinkBlocked: boolean;
  activeOverlayKey: string | null;
  queueKeys: ReadonlySet<string>;
  pendingKeys: ReadonlySet<string>;
  shownOverlayKeys: ReadonlySet<string>;
  dismissedIncoming: ReadonlySet<string>;
  dismissedCheck: ReadonlySet<string>;
  answeredChecks: ReadonlySet<string>;
  locallyAckedIncoming: ReadonlySet<string>;
  source?: OverlayEventSource;
  live: boolean;
  now?: number;
};

export function logOverlayArbiter(
  stage: OverlayArbiterLogStage,
  data: Record<string, unknown>,
): void {
  console.log('[OVERLAY ARBITER]', stage, data);
}

export function overlayEventTimestamp(
  item: QueuedOverlay,
  now = Date.now(),
): number {
  if (item.kind === 'result') {
    const t = Date.parse(item.result.completedAt);
    return Number.isFinite(t) ? t : now;
  }
  const ban = item.ban;
  if (item.kind === 'check' && ban.checkDueAt) {
    const t = Date.parse(ban.checkDueAt);
    if (Number.isFinite(t)) return t;
  }
  const created = Date.parse(ban.createdAt);
  return Number.isFinite(created) ? created : now;
}

export function overlayKindPriority(kind: QueuedOverlay['kind']): number {
  switch (kind) {
    case 'result':
      return 3;
    case 'check':
      return 2;
    case 'incoming':
      return 1;
  }
}

export function isOverlayWithinAutoShowTtl(
  item: QueuedOverlay,
  now = Date.now(),
): boolean {
  return now - overlayEventTimestamp(item, now) <= OVERLAY_AUTO_SHOW_TTL_MS;
}

export function isOverlayDismissedLocally(
  item: QueuedOverlay,
  ctx: Pick<
    OverlayArbiterContext,
    | 'viewerId'
    | 'dismissedIncoming'
    | 'dismissedCheck'
    | 'answeredChecks'
    | 'locallyAckedIncoming'
  >,
): boolean {
  const banId =
    item.kind === 'result'
      ? normalizeId(item.result.id)
      : normalizeId(item.ban.id);
  if (item.kind === 'incoming') {
    if (ctx.dismissedIncoming.has(banId)) return true;
    if (ctx.locallyAckedIncoming.has(banId)) return true;
    if (item.ban.incomingAcknowledged) return true;
  }
  if (item.kind === 'check') {
    if (ctx.dismissedCheck.has(banId)) return true;
    if (ctx.answeredChecks.has(banId)) return true;
  }
  return false;
}

export type OverlayArbiterDecision =
  | { accept: true; reason: 'enqueue' | 'refresh' }
  | { accept: false; reason: string };

export function evaluateOverlayEnqueue(
  item: QueuedOverlay,
  ctx: OverlayArbiterContext,
): OverlayArbiterDecision {
  const key = overlayQueueKey(item);
  const banId =
    item.kind === 'result'
      ? normalizeId(item.result.id)
      : normalizeId(item.ban.id);
  const now = ctx.now ?? Date.now();

  /** Block stale WS/poll/session overlays during deep-link handoff; deeplink source may enqueue. */
  if (ctx.deepLinkBlocked && ctx.source !== 'deeplink') {
    return { accept: false, reason: 'blocked-by-deeplink' };
  }

  if (isOverlayDismissedLocally(item, ctx)) {
    return { accept: false, reason: 'dedup-skip' };
  }

  /** Active queue slot may refresh in place (e.g. reply deeplink shell → /open hydrate). */
  if (ctx.queueKeys.has(key) || ctx.pendingKeys.has(key)) {
    return { accept: true, reason: 'refresh' };
  }

  if (ctx.shownOverlayKeys.has(key)) {
    return { accept: false, reason: 'dedup-skip' };
  }

  const wsFresh = ctx.source === 'ws';
  if (!wsFresh && !isOverlayWithinAutoShowTtl(item, now)) {
    return { accept: false, reason: 'ttl-skip' };
  }

  return { accept: true, reason: 'enqueue' };
}

function mergeStartupPendingDeduped(
  items: readonly QueuedOverlay[],
  now = Date.now(),
): QueuedOverlay[] {
  const byKey = new Map<string, QueuedOverlay>();
  for (const item of items) {
    const key = overlayQueueKey(item);
    const prev = byKey.get(key);
    if (
      !prev ||
      overlayEventTimestamp(item, now) >= overlayEventTimestamp(prev, now)
    ) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const dt = overlayEventTimestamp(b, now) - overlayEventTimestamp(a, now);
    if (dt !== 0) return dt;
    return overlayKindPriority(b.kind) - overlayKindPriority(a.kind);
  });
}

/** Keep only the single most relevant pending item during app launch hold. */
export function mergeStartupPendingSingle(
  current: QueuedOverlay[],
  incoming: QueuedOverlay,
  now = Date.now(),
): QueuedOverlay[] {
  const candidates = mergeStartupPendingDeduped([...current, incoming], now);
  if (candidates.length === 0) return [];
  return [candidates[0]!];
}

/** Keep all pending items during reply-deeplink notification-chain prefetch. */
export function mergeStartupPendingChain(
  current: readonly QueuedOverlay[],
  incoming: readonly QueuedOverlay[],
  now = Date.now(),
): QueuedOverlay[] {
  return mergeStartupPendingDeduped([...current, ...incoming], now);
}

/** Drop auto-show-expired items from the notification queue (history endpoints unaffected). */
export function filterOverlayQueueByTtl(
  queue: QueuedOverlay[],
  now = Date.now(),
): QueuedOverlay[] {
  return queue.filter((item) => isOverlayWithinAutoShowTtl(item, now));
}

export function clearLocalOverlayDismissCache(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  const keys = [
    `98plus_ack_incoming:${userId}`,
    `98plus_dismissed_results:${userId}`,
    `98plus_answered_checks:${userId}`,
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  logOverlayArbiter('dismiss', {
    action: 'clear-local-cache',
    userId,
    keys,
  });
}
