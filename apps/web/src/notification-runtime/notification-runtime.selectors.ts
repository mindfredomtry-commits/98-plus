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
 * pending.itemIds minus consumed.itemIds (order preserved from pending).
 */
export function selectCanonicalPendingItemIds(
  state: NotificationRuntimeState,
): string[] {
  const consumed = new Set(state.consumed.itemIds);
  return state.pending.itemIds.filter((id) => !consumed.has(id));
}

export function selectIndicatorVisible(
  state: NotificationRuntimeState,
): boolean {
  return selectCanonicalPendingItemIds(state).length > 0;
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
  return state.action.status === 'pending';
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
