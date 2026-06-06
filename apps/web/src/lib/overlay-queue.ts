import type { BanInteraction, BanResult } from '@98plus/shared';
import { shouldShowBanResult } from '@/lib/ban-result-flow';
import { shouldShowCheckOverlay } from '@/lib/check-overlay';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';

export type QueuedOverlay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export const APP_NOTIFICATION_Z_INDEX = 100;

export type OverlayQueueGuards = {
  viewerId: string | null;
  dismissedIncoming: ReadonlySet<string>;
  dismissedCheck: ReadonlySet<string>;
  answeredChecks: ReadonlySet<string>;
  checkInFlight: ReadonlySet<string>;
};

export function overlayQueueKey(item: QueuedOverlay): string {
  const id = item.kind === 'result' ? item.result.id : item.ban.id;
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

export function overlayBanId(item: QueuedOverlay): string {
  return item.kind === 'result' ? item.result.id : item.ban.id;
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

export function removeOverlayByKey(
  queue: QueuedOverlay[],
  key: string,
): QueuedOverlay[] {
  return queue.filter((q) => overlayQueueKey(q) !== key);
}

/**
 * Insert or refresh a check overlay without duplicate queue entries.
 * When `toHead` is true, an existing entry is promoted to the queue head.
 */
export function upsertCheckOverlay(
  queue: QueuedOverlay[],
  ban: BanInteraction,
  opts?: { toHead?: boolean },
): { queue: QueuedOverlay[]; changed: boolean; deduped: boolean } {
  const item: QueuedOverlay = { kind: 'check', ban };
  const key = checkOverlayKey(ban.id);
  const idx = queue.findIndex((q) => overlayQueueKey(q) === key);

  if (idx >= 0) {
    const next = [...queue];
    next[idx] = item;
    if (opts?.toHead && idx > 0) {
      next.splice(idx, 1);
      next.unshift(item);
    }
    return { queue: next, changed: true, deduped: true };
  }

  const next = opts?.toHead ? [item, ...queue] : [...queue, item];
  return { queue: next, changed: true, deduped: false };
}

/** Append pending startup items onto the live display queue (FIFO, deduped). */
export function mergeOverlayQueues(
  display: QueuedOverlay[],
  pending: QueuedOverlay[],
): QueuedOverlay[] {
  let next = display;
  for (const item of pending) {
    next = enqueueOverlay(next, item);
  }
  return next;
}
