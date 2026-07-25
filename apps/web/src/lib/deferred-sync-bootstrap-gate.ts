/**
 * Deferred session sync must not requestBootstrap while the runtime owns an
 * overlay lifecycle (draining / showing / submitting / completing).
 *
 * Uses selectLobbyMayShow only — never host overlay flags or owner-shadow.
 */
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../notification-runtime/notification-runtime.selectors';
import type { NotificationRuntimeState } from '../notification-runtime/notification-runtime.types';

/**
 * True when deferred sync may clear its latch and call reloadPending→bootstrap.
 * Equivalent: lifecycle idle and no overlay authority.
 */
export function isRuntimeSafeForDeferredBootstrap(
  state: NotificationRuntimeState,
): boolean {
  return selectLobbyMayShow(state);
}

/**
 * True when reloadPending must refuse requestBootstrap (would wipe a live card).
 * Covers draining + showing (+ submitting/completing).
 */
export function isRuntimeUnsafeForBootstrapRequest(
  state: NotificationRuntimeState,
): boolean {
  return selectOverlayVisible(state);
}

export type DeferredSyncFlushDecision =
  | 'skip-empty'
  | 'defer-unsafe'
  | 'run';

/**
 * Latch protocol for flushDeferredSync:
 * - skip-empty: nothing scheduled
 * - defer-unsafe: keep latch; retry when runtime returns to safe idle
 * - run: clear latch exactly once; caller may start reloadPending
 */
export function decideDeferredSyncFlush(
  latchArmed: boolean,
  state: NotificationRuntimeState,
): DeferredSyncFlushDecision {
  if (!latchArmed) return 'skip-empty';
  if (!isRuntimeSafeForDeferredBootstrap(state)) return 'defer-unsafe';
  return 'run';
}
