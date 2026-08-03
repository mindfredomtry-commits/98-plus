/**
 * TEMP diagnostics for Runtime presentation (Sync V1).
 */
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export type SuccessTraceEvent =
  | 'SUCCESS_EXIT'
  | 'SUCCESS_HANDOFF_START'
  | 'SUCCESS_HANDOFF_RESULT'
  | 'MATERIALIZE_RESULT'
  | 'RUNTIME_STATE_AFTER_SUCCESS'
  | 'LOBBY_CHROME_DECISION';

export function buildSuccessTraceSnapshot(
  state: NotificationRuntimeState,
  hostFlags: {
    notificationChainTransitioning?: boolean;
    startupHold?: boolean;
    blockingReason?: string | null;
    resultOutcome?: string | null;
  } = {},
): Record<string, unknown> {
  return {
    syncStatus: state.syncStatus,
    revision: state.revision,
    activeItemId: state.activeItemId,
    passiveItemIds: [...state.passiveItemIds],
    actionStatus: state.action.status,
    notificationChainTransitioning:
      hostFlags.notificationChainTransitioning ?? null,
    startupHold: hostFlags.startupHold ?? null,
    blockingReason: hostFlags.blockingReason ?? null,
    resultOutcome: hostFlags.resultOutcome ?? null,
  };
}

export function logSuccessTrace(
  event: SuccessTraceEvent,
  snapshot: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'production') return;
  console.log('[success-trace]', event, snapshot);
}
