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

/**
 * True only when the runtime owns a renderable notification display.
 * Queue length alone is not presentation — draining/showing with display=null
 * must not claim the screen (ownership without presentation).
 */
export function selectNotificationPresentationActive(
  state: NotificationRuntimeState,
): boolean {
  if (!OVERLAY_LIFECYCLE.has(state.lifecycle.status)) return false;
  return state.display.kind != null && state.display.payload != null;
}

/**
 * Canonical screen-ownership for Lobby chrome / overlay host paint.
 * Alias of presentation-active — Single Owner display authority only.
 */
export function selectNotificationClaimsScreen(
  state: NotificationRuntimeState,
): boolean {
  return selectNotificationPresentationActive(state);
}

export function selectOverlayVisible(state: NotificationRuntimeState): boolean {
  // Host mount follows presentation, not bare overlay lifecycle.
  return selectNotificationPresentationActive(state);
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
  return (
    state.lifecycle.status === 'idle' &&
    !selectNotificationPresentationActive(state)
  );
}

/**
 * Interactive lobby chrome (top nav + CTA).
 * Hidden only while a renderable notification display owns the screen
 * (or direct-entry / blocked action / true recovery). Queue presence alone
 * does not hide chrome — pending work may leave Lobby interactive.
 */
export function selectInteractiveLobbyChromeMayShow(
  state: NotificationRuntimeState,
): boolean {
  if (selectNotificationPresentationActive(state)) return false;
  if (selectIsDirectEntry(state)) return false;
  if (selectHasDeferredDirectEntry(state)) return false;
  if (selectIsActionBlocked(state)) return false;
  if (state.lifecycle.status === 'recovering') return false;
  // Booting / idle / orphan draining|showing without display → chrome may show.
  // Reconcile settles queue-without-display; chrome must not stay latched.
  if (
    state.lifecycle.status === 'booting' ||
    state.lifecycle.status === 'idle' ||
    state.lifecycle.status === 'draining' ||
    state.lifecycle.status === 'showing' ||
    state.lifecycle.status === 'submitting' ||
    state.lifecycle.status === 'completing'
  ) {
    return true;
  }
  return true;
}

/** Hold ready lobby orb until chrome may paint during unsafe bootstrap. */
export function selectHoldLobbyOrbForBootstrap(
  state: NotificationRuntimeState,
): boolean {
  return (
    selectIsBooting(state) && !selectInteractiveLobbyChromeMayShow(state)
  );
}

export function selectCurrentItemId(
  state: NotificationRuntimeState,
): string | null {
  const current = selectCurrentItem(state);
  return current ? notificationItemId(current) : null;
}
