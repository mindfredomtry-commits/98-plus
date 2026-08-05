/**
 * Shared gate: may Notifications be opened / may a passive head be activated?
 *
 * Availability and ACTIVATE_READY_ITEM_REQUESTED must use this predicate only.
 *
 * Policy:
 * - READY + local FIFO work → allowed
 * - background SYNCING with revision != null, existing items, no conflict → allowed
 * - RECOVERING → blocked
 * - conflict lastConflict (REVISION_GAP / ACTIVE_ITEM_* / INVALID_CONTRACT) → blocked
 * - UNINITIALIZED / FAILED / cold SYNCING / EMPTY → blocked
 */
import type { NotificationsAvailabilityV1 } from './notification-runtime.sync-types';
import type { NotificationsSyncStatusV1 } from './notification-runtime.sync-types';

export type NotificationsConflictTypeV1 =
  | 'REVISION_GAP'
  | 'ACTIVE_ITEM_CONFLICT'
  | 'ACTIVE_ITEM_REMOVE_CONFLICT'
  | 'INVALID_CONTRACT';

export type NotificationsOpenGateStateV1 = {
  syncStatus: NotificationsSyncStatusV1;
  revision: string | null;
  activeItemId: string | null;
  passiveItemIds: readonly string[];
  lastConflict?: { type: NotificationsConflictTypeV1; detail: string } | null;
};

const CONFLICT_TYPES: ReadonlySet<string> = new Set([
  'REVISION_GAP',
  'ACTIVE_ITEM_CONFLICT',
  'ACTIVE_ITEM_REMOVE_CONFLICT',
  'INVALID_CONTRACT',
]);

export function hasReconcileConflictV1(
  state: NotificationsOpenGateStateV1,
): boolean {
  const t = state.lastConflict?.type;
  return t != null && CONFLICT_TYPES.has(t);
}

export function hasLocalFifoWorkV1(state: NotificationsOpenGateStateV1): boolean {
  return state.activeItemId != null || state.passiveItemIds.length > 0;
}

/**
 * Single authority for open + activate eligibility.
 */
export function selectNotificationsMayActivateV1(
  state: NotificationsOpenGateStateV1,
): NotificationsAvailabilityV1 {
  if (state.syncStatus === 'UNINITIALIZED') {
    return { available: false, reason: 'UNINITIALIZED', retryable: true };
  }
  if (state.syncStatus === 'FAILED') {
    return { available: false, reason: 'FAILED', retryable: true };
  }
  if (state.syncStatus === 'RECOVERING') {
    return { available: false, reason: 'RECOVERING', retryable: true };
  }
  if (hasReconcileConflictV1(state)) {
    return { available: false, reason: 'CONFLICT', retryable: true };
  }

  const hasWork = hasLocalFifoWorkV1(state);

  if (state.syncStatus === 'SYNCING') {
    // Background sync only: known revision + local FIFO, no conflict.
    if (state.revision != null && hasWork) {
      return { available: true };
    }
    return { available: false, reason: 'SYNCING', retryable: true };
  }

  // READY
  if (hasWork) return { available: true };
  return { available: false, reason: 'EMPTY', retryable: false };
}
