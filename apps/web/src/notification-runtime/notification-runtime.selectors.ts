/**
 * Vertical 0 — pure derived selectors for notification runtime.
 */
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

const OVERLAY_LIFECYCLE = new Set([
  'showing',
  'submitting',
  'completing',
  'draining',
]);

export function selectCurrentItem(
  state: NotificationRuntimeState,
): NotificationItem | null {
  return state.items.queue[0] ?? null;
}

export function selectOverlayVisible(state: NotificationRuntimeState): boolean {
  return OVERLAY_LIFECYCLE.has(state.lifecycle.status);
}

/**
 * Canonical pending indicator:
 * unique(pending.itemIds) minus consumed.itemIds (order preserved from pending).
 * Queue length / display / current are not badge authority.
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

/** Alias — sole pending-ids selector for production badge. */
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

export function selectIsTransitioning(
  state: NotificationRuntimeState,
): boolean {
  return state.lifecycle.status === 'completing';
}

export function selectIsActionBlocked(
  state: NotificationRuntimeState,
): boolean {
  // pending = HTTP in flight; succeeded = answered, waiting for partner/result
  return (
    state.action.status === 'pending' || state.action.status === 'succeeded'
  );
}

export function selectIsDraining(state: NotificationRuntimeState): boolean {
  return state.lifecycle.status === 'draining';
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
  return (
    state.directEntry.active ||
    state.display.mode === 'direct' ||
    state.display.mode === 'direct-overboard'
  );
}

export function selectDirectReturnPolicy(
  state: NotificationRuntimeState,
): NotificationRuntimeState['directEntry']['returnPolicy'] {
  return state.directEntry.returnPolicy;
}

export function selectHasDeferredDirectEntry(
  state: NotificationRuntimeState,
): boolean {
  return state.directEntry.deferred != null;
}

export function selectLobbyMayShow(state: NotificationRuntimeState): boolean {
  return state.lifecycle.status === 'idle' && !selectOverlayVisible(state);
}

export function selectCurrentItemId(
  state: NotificationRuntimeState,
): string | null {
  const current = selectCurrentItem(state);
  return current ? notificationItemId(current) : null;
}
