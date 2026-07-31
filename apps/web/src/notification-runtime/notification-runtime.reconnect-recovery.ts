/**
 * Stage 7 Phase 1 — reconnect decision is infrastructure-only.
 * Never reads presentation / surface visibility.
 */
import type { NotificationRuntimeState } from './notification-runtime.types';

export type WsReconnectSignalSource = 'socket-open' | 'socket-close-timeout';

/**
 * Pure WS reconnect signal gate (connection-layer only).
 * Independent of queue / presentation state.
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
  | { action: 'bootstrap'; reason: 'safe-idle-or-empty' }
  | {
      action: 'coalesce';
      reason: 'recovery-in-flight';
      transitionId: string;
    }
  | {
      action: 'supersede';
      reason: 'interrupt-in-flight';
      previousTransitionId: string;
    };

/**
 * Decide whether a WS reconnect should start a new bootstrap/recovery fetch.
 * Visibility / card / surface state is intentionally ignored.
 */
export function decideReconnectRecoveryRequest(
  state: NotificationRuntimeState,
  args?: { forceSupersede?: boolean },
): ReconnectRecoveryRequestDecision {
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

export function nextAppliedPendingGeneration(
  currentGeneration: number,
  stamped: number | null | undefined,
): number {
  if (stamped == null) return currentGeneration;
  return Math.max(currentGeneration, stamped);
}

export function isStalePendingGeneration(
  currentGeneration: number,
  stamped: number | null | undefined,
): boolean {
  if (stamped == null) return false;
  return stamped < currentGeneration;
}

export function isDuplicateQueuedIdentity(
  queueIds: readonly string[],
  itemId: string,
): boolean {
  return queueIds.includes(itemId);
}
