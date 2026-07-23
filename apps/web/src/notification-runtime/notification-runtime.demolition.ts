/**
 * Vertical 8–9 — Legacy demolition helpers.
 *
 * Sole production notification paint/queue/pending authority:
 *   notification-runtime selectors / state.
 *
 * Vertical 9: RuntimeLegacySinks are empty — no write-through dual store.
 * Owner shadow must not act as a notification runtime engine.
 */
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
  type LegacyDisplayProjection,
} from './notification-runtime.adapters';
import type { RuntimeLegacySinks } from './notification-runtime.production-advance';
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

/** Vertical 9 — production sinks are no-ops (no dual-store / projection engine). */
export const EMPTY_RUNTIME_LEGACY_SINKS: RuntimeLegacySinks = {
  writeQueue: () => {},
  writeDisplay: () => {},
};

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

/** Diagnostic: compare ids against runtime paint (read-only). */
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
