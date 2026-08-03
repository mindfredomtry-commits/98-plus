/**
 * Stage 8 Phase 8 — Runtime selectors (target Sync V1 state only).
 */
import type { NotificationItemV1 } from '@98plus/shared';
import { selectNotificationsAvailabilityV1 } from './notification-runtime.reconcile';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';

export function selectActiveItemId(
  state: NotificationRuntimeState,
): string | null {
  return state.activeItemId;
}

export function selectActiveItemV1(
  state: NotificationRuntimeState,
): NotificationItemV1 | null {
  if (!state.activeItemId) return null;
  return state.itemsById[state.activeItemId] ?? null;
}

/** Presentation projection for active item (temporary adapter cache). */
export function selectActiveItem(
  state: NotificationRuntimeState,
): NotificationItem | null {
  const id = state.activeItemId;
  if (!id) return null;
  return state.presentationByItemId[id] ?? null;
}

export function selectPassiveItemIds(
  state: NotificationRuntimeState,
): readonly string[] {
  return state.passiveItemIds;
}

/** Ready head = passive FIFO head (not an activation claim). */
export function selectReadyHeadId(
  state: NotificationRuntimeState,
): string | null {
  return state.passiveItemIds[0] ?? null;
}

export function selectIsActionBlocked(
  state: NotificationRuntimeState,
): boolean {
  return state.action.status === 'SUBMITTING';
}

export function selectIsActionSubmitting(
  state: NotificationRuntimeState,
): boolean {
  return state.action.status === 'SUBMITTING';
}

export function selectSyncStatus(state: NotificationRuntimeState) {
  return state.syncStatus;
}

export function selectIsSyncReady(state: NotificationRuntimeState): boolean {
  return state.syncStatus === 'READY';
}

export function selectIsRecovering(state: NotificationRuntimeState): boolean {
  return state.syncStatus === 'RECOVERING';
}

export function selectIsBooting(state: NotificationRuntimeState): boolean {
  return (
    state.syncStatus === 'SYNCING' || state.syncStatus === 'UNINITIALIZED'
  );
}

export function selectQueueLength(state: NotificationRuntimeState): number {
  return (
    state.passiveItemIds.length + (state.activeItemId != null ? 1 : 0)
  );
}

export function selectHasNext(state: NotificationRuntimeState): boolean {
  return state.passiveItemIds.length > 0;
}

export function selectRuntimeAvailability(state: NotificationRuntimeState) {
  return selectNotificationsAvailabilityV1(state);
}

export function selectIsDirectEntry(_state: NotificationRuntimeState): boolean {
  return false;
}

export function selectHasDeferredDirectEntry(
  _state: NotificationRuntimeState,
): boolean {
  return false;
}

export function selectCanonicalPendingItemIds(
  state: NotificationRuntimeState,
): string[] {
  return [...state.passiveItemIds];
}

export function selectPendingItemIds(state: NotificationRuntimeState): string[] {
  return selectCanonicalPendingItemIds(state);
}

export function selectPendingCount(state: NotificationRuntimeState): number {
  return state.passiveItemIds.length;
}

export function selectHasPending(state: NotificationRuntimeState): boolean {
  return state.passiveItemIds.length > 0 || state.activeItemId != null;
}

export function selectIndicatorVisible(
  state: NotificationRuntimeState,
): boolean {
  return selectHasPending(state);
}

export function selectInteractiveLobbyChromeMayShow(
  _state: NotificationRuntimeState,
): boolean {
  return true;
}

/**
 * @deprecated Removed — must not target queue head for actions.
 * Kept as compile-fail trap: throws if called.
 */
export function selectCurrentItem(_state: NotificationRuntimeState): never {
  throw new Error(
    'selectCurrentItem removed — use selectActiveItem / selectActionTargetV1',
  );
}
