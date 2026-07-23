/**
 * Vertical 8 — Legacy demolition helpers.
 *
 * Sole production notification paint/queue/pending authority:
 *   notification-runtime selectors / state.
 *
 * Owner shadow, React overlayQueue, and projection sinks
 * are TEMP write-through or product-exclusive pins only — never decide
 * queue advance, display, badge, bootstrap, or lobby.
 */
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
  type LegacyDisplayProjection,
} from './notification-runtime.adapters';
import {
  selectHasPending,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from './notification-runtime.selectors';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

export type RuntimePaintSnapshot = {
  display: LegacyDisplayProjection;
  queue: QueuedOverlay[];
  queueHead: QueuedOverlay | null;
  queueLength: number;
  pendingCount: number;
  hasPending: boolean;
  overlayVisible: boolean;
  lobbyMayShow: boolean;
};

/** Sole notification paint snapshot for production UI. */
export function selectRuntimePaintSnapshot(
  state: NotificationRuntimeState,
): RuntimePaintSnapshot {
  const queue = projectRuntimeQueueToLegacy(state);
  return {
    display: projectRuntimeDisplayToLegacy(state),
    queue,
    queueHead: queue[0] ?? null,
    queueLength: queue.length,
    pendingCount: selectPendingCount(state),
    hasPending: selectHasPending(state),
    overlayVisible: selectOverlayVisible(state),
    lobbyMayShow: selectLobbyMayShow(state),
  };
}

export function runtimeItemToQueuedOverlay(
  item: NotificationItem,
): QueuedOverlay {
  if (item.kind === 'result') return { kind: 'result', result: item.result };
  if (item.kind === 'check') return { kind: 'check', ban: item.ban };
  return { kind: 'incoming', ban: item.ban };
}

export function queuedOverlaysEqualHead(
  a: QueuedOverlay | null | undefined,
  b: QueuedOverlay | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'result' && b.kind === 'result') {
    return a.result.id === b.result.id;
  }
  if (
    (a.kind === 'incoming' || a.kind === 'check') &&
    (b.kind === 'incoming' || b.kind === 'check')
  ) {
    return a.ban.id === b.ban.id;
  }
  return false;
}

/** Diagnostic: owner/legacy mirror must not diverge from runtime for notification cards. */
export function runtimePaintIds(state: NotificationRuntimeState): {
  incomingId: string | null;
  checkId: string | null;
  resultId: string | null;
  headId: string | null;
} {
  const display = projectRuntimeDisplayToLegacy(state);
  const head = state.items.queue[0] ?? null;
  return {
    incomingId: display.incomingBan?.id ?? null,
    checkId: display.checkBan?.id ?? null,
    resultId: display.result?.id ?? null,
    headId: head ? notificationItemId(head) : null,
  };
}
