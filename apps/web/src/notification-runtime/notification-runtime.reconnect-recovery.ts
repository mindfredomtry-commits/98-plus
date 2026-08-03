/**
 * Stage 8 Phase 8 — reconnect decisions (Sync V1 status; no queue clear).
 */
import type { NotificationRuntimeState } from './notification-runtime.types';

export type WsReconnectSignalSource = 'socket-open' | 'socket-close-timeout';

export function decideWsReconnectSignal(args: {
  source: WsReconnectSignalSource;
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

export function decideReconnectRecoveryRequest(
  state: NotificationRuntimeState,
  args?: { forceSupersede?: boolean },
): ReconnectRecoveryRequestDecision {
  const inFlight =
    state.syncStatus === 'SYNCING' || state.syncStatus === 'RECOVERING'
      ? state.syncTransitionId
      : null;

  if (inFlight) {
    if (args?.forceSupersede) {
      return {
        action: 'supersede',
        reason: 'interrupt-in-flight',
        previousTransitionId: inFlight,
      };
    }
    return {
      action: 'coalesce',
      reason: 'recovery-in-flight',
      transitionId: inFlight,
    };
  }

  return { action: 'bootstrap', reason: 'safe-idle-or-empty' };
}

export function isRecoveryTransitionCurrent(
  state: NotificationRuntimeState,
  transitionId: string,
): boolean {
  if (state.syncStatus !== 'SYNCING' && state.syncStatus !== 'RECOVERING') {
    return false;
  }
  return state.syncTransitionId === transitionId;
}
