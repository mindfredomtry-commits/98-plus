import type { BanInteraction, BanResult } from '@98plus/shared';
import { shouldShowBanResult } from '@/lib/ban-result-flow';
import { shouldShowCheckOverlay } from '@/lib/check-overlay';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import { logEmptyOverlayItemRejected } from '@/lib/check-chain-drain-debug';
import { normalizeId } from '@/lib/normalize-json';

export type QueuedOverlay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

const VALID_OVERLAY_KINDS = new Set<QueuedOverlay['kind']>([
  'incoming',
  'check',
  'result',
]);

export type OverlayQueueRejectContext = {
  source: string;
  queueLen?: number;
  currentHead?: string | null;
  nextHead?: string | null;
  reason?: string;
  banId?: string | null;
};

function overlayItemBanIdFromUnknown(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as { kind?: unknown; ban?: { id?: unknown }; result?: { id?: unknown } };
  if (row.kind === 'result' && row.result) {
    const id = normalizeId(row.result.id);
    return id || null;
  }
  if (row.ban) {
    const id = normalizeId(row.ban.id);
    return id || null;
  }
  return null;
}

function invalidOverlayRejectReason(item: unknown): string {
  if (item == null) return 'null-item';
  if (typeof item !== 'object') return 'non-object-item';
  const kind = (item as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !VALID_OVERLAY_KINDS.has(kind as QueuedOverlay['kind'])) {
    return typeof kind === 'string' ? `invalid-kind:${kind}` : 'missing-kind';
  }
  if (kind === 'result') {
    const result = (item as { result?: unknown }).result;
    if (!result || typeof result !== 'object') return 'result-missing-payload';
    const id = normalizeId((result as { id?: unknown }).id);
    return id ? 'valid' : 'result-missing-id';
  }
  const ban = (item as { ban?: unknown }).ban;
  if (!ban || typeof ban !== 'object') return `${kind}-missing-ban`;
  const id = normalizeId((ban as { id?: unknown }).id);
  return id ? 'valid' : `${kind}-missing-ban-id`;
}

/** Reject unknown/empty overlay items — only real notification card types are allowed. */
export function isValidQueuedOverlay(item: unknown): item is QueuedOverlay {
  return invalidOverlayRejectReason(item) === 'valid';
}

export function sanitizeOverlayQueue(
  queue: QueuedOverlay[],
  source: string,
): QueuedOverlay[] {
  const valid: QueuedOverlay[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    if (isValidQueuedOverlay(item)) {
      valid.push(item);
      continue;
    }
    const nextValid = queue.slice(index + 1).find((candidate) => isValidQueuedOverlay(candidate));
    logEmptyOverlayItemRejected({
      source,
      queueLen: queue.length,
      currentHead: valid[0] ? overlayQueueKey(valid[0]) : null,
      nextHead: nextValid ? overlayQueueKey(nextValid) : null,
      reason: invalidOverlayRejectReason(item),
      banId: overlayItemBanIdFromUnknown(item),
      index,
    });
  }
  return valid;
}

export const APP_NOTIFICATION_BACKDROP_Z_INDEX = 100;
/** Visual queue shield — above lobby chrome / portaled active-ban (120). */
export const APP_NOTIFICATION_VISUAL_SHIELD_Z_INDEX = 150;
/** Cards must sit above backdrop and any stale check-direct layers. */
export const APP_NOTIFICATION_CARD_Z_INDEX = 110;
export const APP_NOTIFICATION_Z_INDEX = APP_NOTIFICATION_BACKDROP_Z_INDEX;

/** Fresh result layer above notification queue shell (overboard optimistic). */
export const DIRECT_OVERBOARD_RESULT_Z_INDEX = 999_999;

export type OverlayQueueGuards = {
  viewerId: string | null;
  dismissedIncoming: ReadonlySet<string>;
  dismissedCheck: ReadonlySet<string>;
  answeredChecks: ReadonlySet<string>;
  checkInFlight: ReadonlySet<string>;
};

export function overlayQueueKey(item: QueuedOverlay): string {
  const id =
    item.kind === 'result'
      ? normalizeId(item.result.id)
      : normalizeId(item.ban.id);
  return `${item.kind}:${id}`;
}

/** Stable dedup key for check overlays — one active check per ban id. */
export function checkOverlayKey(banId: string): string {
  return `check:${banId}`;
}

export function hasCheckInQueue(
  queue: QueuedOverlay[],
  banId: string,
): boolean {
  return queue.some(
    (q) => q.kind === 'check' && overlayQueueKey(q) === checkOverlayKey(banId),
  );
}

export function getActiveOverlayKey(queue: QueuedOverlay[]): string | null {
  const head = queue[0];
  return head ? overlayQueueKey(head) : null;
}

export type EnqueueOverlayAction =
  | 'display-new'
  | 'enqueue-waiting'
  | 'same-key-refresh'
  | 'dedup';

/**
 * Enqueue with active-overlay lock: only queue[0] is displayed.
 * While head exists, new items with a different key append to the tail.
 * Same-key items refresh data in place without changing the active overlay.
 */
export function enqueueWithActiveLock(
  queue: QueuedOverlay[],
  item: QueuedOverlay,
  rejectCtx?: Pick<OverlayQueueRejectContext, 'source'>,
): { queue: QueuedOverlay[]; changed: boolean; action: EnqueueOverlayAction } {
  if (!isValidQueuedOverlay(item)) {
    logEmptyOverlayItemRejected({
      source: rejectCtx?.source ?? 'enqueueWithActiveLock',
      queueLen: queue.length,
      currentHead: queue[0] ? overlayQueueKey(queue[0]) : null,
      nextHead: null,
      reason: invalidOverlayRejectReason(item),
      banId: overlayItemBanIdFromUnknown(item),
    });
    return { queue, changed: false, action: 'dedup' };
  }
  const newKey = overlayQueueKey(item);
  const activeKey = getActiveOverlayKey(queue);
  const existingIdx = queue.findIndex((q) => overlayQueueKey(q) === newKey);

  if (existingIdx >= 0) {
    const next = [...queue];
    next[existingIdx] = item;
    return { queue: next, changed: true, action: 'same-key-refresh' };
  }

  if (activeKey === null) {
    return { queue: [item], changed: true, action: 'display-new' };
  }

  let next = queue;
  if (item.kind === 'result') {
    const banId = overlayBanId(item);
    next = next.filter((q, idx) => {
      if (idx === 0) return true;
      if (overlayBanId(q) !== banId) return true;
      return q.kind === 'result';
    });
  }

  return {
    queue: [...next, item],
    changed: true,
    action: 'enqueue-waiting',
  };
}

export function overlayBanId(item: QueuedOverlay): string {
  return item.kind === 'result'
    ? normalizeId(item.result.id)
    : normalizeId(item.ban.id);
}

/** FIFO enqueue with dedup; result supersedes pending check/incoming for same ban. */
export function enqueueOverlay(
  queue: QueuedOverlay[],
  item: QueuedOverlay,
  rejectCtx?: Pick<OverlayQueueRejectContext, 'source'>,
): QueuedOverlay[] {
  if (!isValidQueuedOverlay(item)) {
    logEmptyOverlayItemRejected({
      source: rejectCtx?.source ?? 'enqueueOverlay',
      queueLen: queue.length,
      currentHead: queue[0] ? overlayQueueKey(queue[0]) : null,
      nextHead: null,
      reason: invalidOverlayRejectReason(item),
      banId: overlayItemBanIdFromUnknown(item),
    });
    return queue;
  }
  if (queue.some((q) => overlayQueueKey(q) === overlayQueueKey(item))) {
    return queue;
  }

  let next = queue;
  const banId = overlayBanId(item);

  if (item.kind === 'result') {
    next = next.filter(
      (q) => overlayBanId(q) !== banId || q.kind === 'result',
    );
  }

  return [...next, item];
}

/** Live WS/poll events jump ahead of queued items (still deduped). */
export function prependOverlay(
  queue: QueuedOverlay[],
  item: QueuedOverlay,
  rejectCtx?: Pick<OverlayQueueRejectContext, 'source'>,
): QueuedOverlay[] {
  if (!isValidQueuedOverlay(item)) {
    logEmptyOverlayItemRejected({
      source: rejectCtx?.source ?? 'prependOverlay',
      queueLen: queue.length,
      currentHead: queue[0] ? overlayQueueKey(queue[0]) : null,
      nextHead: null,
      reason: invalidOverlayRejectReason(item),
      banId: overlayItemBanIdFromUnknown(item),
    });
    return queue;
  }
  if (queue.some((q) => overlayQueueKey(q) === overlayQueueKey(item))) {
    return queue;
  }
  let next = queue;
  const banId = overlayBanId(item);
  if (item.kind === 'result') {
    next = next.filter(
      (q) => overlayBanId(q) !== banId || q.kind === 'result',
    );
  }
  return [item, ...next];
}

export function pruneOverlayQueue(
  queue: QueuedOverlay[],
  guards: OverlayQueueGuards,
): QueuedOverlay[] {
  const { viewerId, dismissedIncoming, dismissedCheck, answeredChecks, checkInFlight } =
    guards;
  return queue.filter((item) => {
    if (item.kind === 'incoming') {
      return shouldShowIncomingBanModal(
        item.ban,
        viewerId,
        dismissedIncoming,
      );
    }
    if (item.kind === 'check') {
      return shouldShowCheckOverlay(
        item.ban,
        viewerId,
        dismissedCheck,
        answeredChecks,
        checkInFlight,
        false,
      );
    }
    return shouldShowBanResult(item.result, 'auto', item.result.id, viewerId);
  });
}

export function dequeueOverlay(queue: QueuedOverlay[]): QueuedOverlay[] {
  return queue.length <= 1 ? [] : queue.slice(1);
}

export function popOverlayHead(queue: QueuedOverlay[]): QueuedOverlay[] {
  return queue.slice(1);
}

export function removeOverlaysForBan(
  queue: QueuedOverlay[],
  banId: string,
  kinds?: QueuedOverlay['kind'][],
): QueuedOverlay[] {
  return queue.filter((q) => {
    if (overlayBanId(q) !== banId) return true;
    if (!kinds) return false;
    return !kinds.includes(q.kind);
  });
}

/** Check for banId replaces stale check/incoming and becomes queue head. */
export function buildCheckPriorityQueue(
  queue: QueuedOverlay[],
  banId: string,
  checkItem: QueuedOverlay,
): QueuedOverlay[] {
  const cleaned = removeOverlaysForBan(queue, banId, ['check', 'incoming']);
  const checkKey = overlayQueueKey(checkItem);
  return [checkItem, ...cleaned.filter((q) => overlayQueueKey(q) !== checkKey)];
}

/** Result for banId replaces any stale check/incoming and becomes queue head. */
export function buildResultPriorityQueue(
  queue: QueuedOverlay[],
  banId: string,
  resultItem: QueuedOverlay,
): QueuedOverlay[] {
  const cleaned = removeOverlaysForBan(queue, banId);
  const resultKey = overlayQueueKey(resultItem);
  return [resultItem, ...cleaned.filter((q) => overlayQueueKey(q) !== resultKey)];
}

export function hasStaleCheckOverlayForBan(
  queue: readonly QueuedOverlay[],
  banId: string,
): boolean {
  const norm = banId.trim();
  if (!norm) return false;
  return queue.some(
    (q) =>
      (q.kind === 'check' || q.kind === 'incoming') && overlayBanId(q) === norm,
  );
}

export function removeOverlayByKey(
  queue: QueuedOverlay[],
  key: string,
): QueuedOverlay[] {
  return queue.filter((q) => overlayQueueKey(q) !== key);
}

/** @deprecated Use enqueueWithActiveLock — never promotes check above active overlay. */
export function upsertCheckOverlay(
  queue: QueuedOverlay[],
  ban: BanInteraction,
): { queue: QueuedOverlay[]; changed: boolean; deduped: boolean } {
  const { queue: next, changed, action } = enqueueWithActiveLock(queue, {
    kind: 'check',
    ban,
  });
  return {
    queue: next,
    changed,
    deduped: action === 'same-key-refresh' || action === 'dedup',
  };
}

/** Append pending startup items onto the live display queue (respects active lock). */
export function mergeOverlayQueues(
  display: QueuedOverlay[],
  pending: QueuedOverlay[],
): QueuedOverlay[] {
  let next = sanitizeOverlayQueue(display, 'mergeOverlayQueues-display');
  for (const item of sanitizeOverlayQueue(pending, 'mergeOverlayQueues-pending')) {
    next = enqueueWithActiveLock(next, item, { source: 'mergeOverlayQueues' }).queue;
  }
  return next;
}
