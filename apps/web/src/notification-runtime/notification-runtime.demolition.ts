/**
 * Stage 7 Phase 1 — demolition residue.
 * EMPTY_RUNTIME_LEGACY_SINKS removed from production live path.
 * Paint/lobby snapshot APIs are not production-reachable.
 */
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
  type LegacyDisplayProjection,
} from './notification-runtime.adapters';
import {
  selectHasPending,
  selectPendingCount,
} from './notification-runtime.selectors';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

/** @deprecated Not used on Stage 7 production live path. */
export const EMPTY_RUNTIME_LEGACY_SINKS = {
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
};

/** Residual test helper — not Host production API. */
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
    return String(a.result.id) === String(b.result.id);
  }
  if (a.kind !== 'result' && b.kind !== 'result') {
    return String(a.ban.id) === String(b.ban.id);
  }
  return false;
}

export function runtimeQueueHeadId(
  state: NotificationRuntimeState,
): string | null {
  const head = state.items.queue[0];
  return head ? notificationItemId(head) : null;
}
