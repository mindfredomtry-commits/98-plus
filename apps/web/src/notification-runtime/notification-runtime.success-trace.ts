/**
 * Sanitized SUCCESS continuum snapshot for TEMP console traces.
 * IDs only — never card text / tokens / initData.
 */
import {
  selectCanonicalPendingItemIds,
  selectInteractiveLobbyChromeMayShow,
} from './notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export function buildSuccessTraceSnapshot(
  state: NotificationRuntimeState,
  hostFlags: {
    notificationChainTransitioning?: boolean;
    startupHold?: boolean;
    blockingReason?: string | null;
    resultOutcome?: string | null;
  } = {},
): Record<string, unknown> {
  const queueIds = state.items.queue.map((item) => notificationItemId(item));
  const pendingIds = selectCanonicalPendingItemIds(state);
  return {
    lifecycle: state.lifecycle.status,
    transitionId: state.lifecycle.transitionId,
    displayKind: state.display.kind,
    displayId: state.display.payload
      ? notificationItemId(state.display.payload)
      : null,
    queueIds,
    queueCount: queueIds.length,
    pendingIds,
    pendingCount: pendingIds.length,
    notificationChainTransitioning:
      hostFlags.notificationChainTransitioning ?? null,
    startupHold: hostFlags.startupHold ?? null,
    lobbyChromeAllowed: selectInteractiveLobbyChromeMayShow(state),
    blockingReason: hostFlags.blockingReason ?? null,
    resultOutcome: hostFlags.resultOutcome ?? null,
  };
}
