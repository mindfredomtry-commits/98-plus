/**
 * Pure notification-queue consume transitions (no UI / Providers).
 *
 * Uses promotePendingIfOverlayEmpty from src/lib (same helper as runtime).
 */

import { promotePendingIfOverlayEmpty } from '../src/lib/queue-consume-transition';

export type OverlayKind = 'incoming' | 'check' | 'result';

export type QueuedOverlay =
  | { kind: 'incoming'; banId: string }
  | { kind: 'check'; banId: string }
  | { kind: 'result'; banId: string };

export type NotificationQueueState = {
  overlayQueue: QueuedOverlay[];
  pending: QueuedOverlay[];
};

export { promotePendingIfOverlayEmpty };

export function overlayBanId(item: QueuedOverlay): string {
  return item.banId;
}

export function overlayQueueKey(item: QueuedOverlay): string {
  return `${item.kind}:${item.banId}`;
}

export function queueHead(state: NotificationQueueState): QueuedOverlay | null {
  return state.overlayQueue[0] ?? null;
}

export function queueHeadBanId(state: NotificationQueueState): string | null {
  const head = queueHead(state);
  return head ? overlayBanId(head) : null;
}

export function popOverlayHead(queue: QueuedOverlay[]): QueuedOverlay[] {
  return queue.slice(1);
}

export function removeOverlaysForBan(
  queue: QueuedOverlay[],
  banId: string,
  kinds?: OverlayKind[],
): QueuedOverlay[] {
  return queue.filter((q) => {
    if (overlayBanId(q) !== banId) return true;
    if (!kinds) return false;
    return !kinds.includes(q.kind);
  });
}

/** Incoming consume: drop incoming for banId, apply remaining overlay as-is. */
export function consumeIncoming(
  state: NotificationQueueState,
  banId: string,
): NotificationQueueState {
  const next = state.overlayQueue.filter(
    (q) => !(q.kind === 'incoming' && q.banId === banId),
  );
  return {
    overlayQueue: next,
    pending: state.pending,
  };
}

/** Check first-answer: remove check, promote pending when overlay empty. */
export function consumeCheckFirstAnswer(
  state: NotificationQueueState,
  banId: string,
): NotificationQueueState {
  const remaining = removeOverlaysForBan(state.overlayQueue, banId, ['check']);
  return promotePendingIfOverlayEmpty({
    overlayQueue: remaining,
    pending: state.pending,
  });
}

/** Result go-to-bans / result-dismiss: remove result, promote pending when overlay empty. */
export function consumeResultGoToBans(
  state: NotificationQueueState,
  banId: string,
): NotificationQueueState {
  const remaining = removeOverlaysForBan(state.overlayQueue, banId, ['result']);
  return promotePendingIfOverlayEmpty({
    overlayQueue: remaining,
    pending: state.pending,
  });
}
