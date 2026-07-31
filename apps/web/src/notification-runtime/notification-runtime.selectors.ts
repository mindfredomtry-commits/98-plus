/**
 * Stage 7 Phase 1 — queue / lifecycle selectors only.
 * No Lobby, chrome, orb, CTA, or presentation-policy projections.
 */
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

/** Ready head = FIFO queue[0]. Not an activated / visible surface claim. */
export function selectCurrentItem(
  state: NotificationRuntimeState,
): NotificationItem | null {
  return state.items.queue[0] ?? null;
}

export function selectReadyHeadId(
  state: NotificationRuntimeState,
): string | null {
  const head = selectCurrentItem(state);
  return head ? notificationItemId(head) : null;
}

/** @deprecated Alias — ready head id, not an activated surface. */
export function selectCurrentItemId(
  state: NotificationRuntimeState,
): string | null {
  return selectReadyHeadId(state);
}

/**
 * Canonical pending indicator:
 * unique(pending.itemIds) minus consumed.itemIds (order preserved from pending).
 */
export function selectCanonicalPendingItemIds(
  state: NotificationRuntimeState,
): string[] {
  const consumed = new Set(state.consumed.itemIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of state.pending.itemIds) {
    if (!id || consumed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export const selectPendingItemIds = selectCanonicalPendingItemIds;

export function selectPendingCount(state: NotificationRuntimeState): number {
  return selectPendingItemIds(state).length;
}

export function selectHasPending(state: NotificationRuntimeState): boolean {
  return selectPendingCount(state) > 0;
}

export function selectIndicatorVisible(
  state: NotificationRuntimeState,
): boolean {
  return selectHasPending(state);
}

export function selectHasNext(state: NotificationRuntimeState): boolean {
  return state.items.queue.length > 1;
}

export function selectIsActionBlocked(
  state: NotificationRuntimeState,
): boolean {
  return (
    state.action.status === 'pending' || state.action.status === 'succeeded'
  );
}

export function selectIsBooting(state: NotificationRuntimeState): boolean {
  return state.lifecycle.status === 'booting';
}

export function selectIsRecovering(state: NotificationRuntimeState): boolean {
  return (
    state.lifecycle.status === 'recovering' ||
    state.recovery.status === 'loading'
  );
}

export function selectIsDirectEntry(state: NotificationRuntimeState): boolean {
  return state.directEntry.active;
}

export function selectHasDeferredDirectEntry(
  state: NotificationRuntimeState,
): boolean {
  return state.directEntry.deferred != null;
}

export function selectQueueLength(state: NotificationRuntimeState): number {
  return state.items.queue.length;
}
