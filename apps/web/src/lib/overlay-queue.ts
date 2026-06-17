import type { BanInteraction, BanResult } from '@98plus/shared';
import { shouldShowBanResult } from '@/lib/ban-result-flow';
import { shouldShowCheckOverlay } from '@/lib/check-overlay';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import { normalizeId } from '@/lib/normalize-json';

export type QueuedOverlay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export const APP_NOTIFICATION_Z_INDEX = 100;

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
): { queue: QueuedOverlay[]; changed: boolean; action: EnqueueOverlayAction } {
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
): QueuedOverlay[] {
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
): QueuedOverlay[] {
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
  let next = display;
  for (const item of pending) {
    next = enqueueWithActiveLock(next, item).queue;
  }
  return next;
}
