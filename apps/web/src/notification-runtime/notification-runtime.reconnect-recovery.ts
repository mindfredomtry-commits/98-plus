/**
 * Stage 6B Phase 4 — reconnect / recovery determinism (pure helpers).
 *
 * Prefer identity + generation + monotonic transition ownership over timers.
 */

import { selectOverlayVisible } from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';

export type WsReconnectSignalSource = 'socket-open' | 'socket-close-timeout';

/**
 * Emit host recovery only on a true reconnect (socket open after a prior open).
 * Close-timeout must never emit — that was the double-refresh root cause.
 */
export function decideWsReconnectSignal(args: {
  source: WsReconnectSignalSource;
  /** True after at least one successful onopen in this socket session lifetime. */
  hasOpenedOnce: boolean;
}): { emit: boolean; reason: string } {
  if (args.source === 'socket-close-timeout') {
    return { emit: false, reason: 'close-timeout-never-emits' };
  }
  if (!args.hasOpenedOnce) {
    return { emit: false, reason: 'initial-open-skipped' };
  }
  return { emit: true, reason: 'reconnect-open' };
}

export type ReconnectRecoveryRequestDecision =
  | {
      action: 'skip';
      reason: 'overlay-visible' | 'already-complete-idle-empty';
    }
  | {
      action: 'coalesce';
      reason: 'recovery-in-flight';
      transitionId: string;
    }
  | {
      action: 'bootstrap';
      reason: 'safe-idle-or-empty';
    }
  | {
      action: 'supersede';
      reason: 'interrupt-in-flight';
      previousTransitionId: string;
    };

/**
 * Decide how a reconnect should talk to the runtime.
 *
 * - overlay visible → skip (must not wipe live card)
 * - recovery/boot already loading → coalesce by default (same reconnect storm)
 * - forceSupersede → second intentional reconnect interrupts (newer transition wins)
 */
export function decideReconnectRecoveryRequest(
  state: NotificationRuntimeState,
  args?: { forceSupersede?: boolean },
): ReconnectRecoveryRequestDecision {
  if (selectOverlayVisible(state)) {
    return { action: 'skip', reason: 'overlay-visible' };
  }

  const inFlightId =
    state.recovery.status === 'loading'
      ? state.recovery.transitionId
      : state.lifecycle.status === 'booting' ||
          state.lifecycle.status === 'recovering'
        ? state.lifecycle.transitionId ?? state.recovery.transitionId
        : null;

  if (inFlightId) {
    if (args?.forceSupersede) {
      return {
        action: 'supersede',
        reason: 'interrupt-in-flight',
        previousTransitionId: inFlightId,
      };
    }
    return {
      action: 'coalesce',
      reason: 'recovery-in-flight',
      transitionId: inFlightId,
    };
  }

  return { action: 'bootstrap', reason: 'safe-idle-or-empty' };
}

/** True when a bootstrap/recovery response still owns the in-flight transition. */
export function isRecoveryTransitionCurrent(
  state: NotificationRuntimeState,
  transitionId: string,
): boolean {
  if (state.recovery.status === 'loading') {
    return state.recovery.transitionId === transitionId;
  }
  if (
    state.lifecycle.status === 'booting' ||
    state.lifecycle.status === 'recovering'
  ) {
    const expected =
      state.recovery.transitionId ?? state.lifecycle.transitionId;
    return expected === transitionId;
  }
  return false;
}

/**
 * Pending generation must only move forward. Returns the stamped generation
 * that should be applied (max of current and incoming).
 */
export function nextAppliedPendingGeneration(
  currentGeneration: number,
  stamped: number | null | undefined,
): number {
  if (stamped == null) return currentGeneration;
  return Math.max(currentGeneration, stamped);
}

/**
 * Whether an incoming pending snapshot is stale relative to runtime.
 * Older stamped empty/non-empty both lose when stamped < current.
 */
export function isStalePendingGeneration(
  currentGeneration: number,
  stamped: number | null | undefined,
): boolean {
  if (stamped == null) return false;
  return stamped < currentGeneration;
}

/** Duplicate ITEM_COMPLETED / enqueue identity helper for tests and adapters. */
export function isDuplicateQueuedIdentity(
  queueIds: readonly string[],
  itemId: string,
): boolean {
  return queueIds.includes(itemId);
}
