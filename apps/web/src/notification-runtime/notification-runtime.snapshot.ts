/**
 * Stage 7 Phase 1 — residual snapshot helper (not Host production API).
 */
import {
  selectHasPending,
  selectPendingCount,
  selectReadyHeadId,
} from './notification-runtime.selectors';
import { projectRuntimeDisplayToLegacy } from './notification-runtime.adapters';
import type { NotificationRuntimeState } from './notification-runtime.types';

export function selectRuntimeSnapshot(state: NotificationRuntimeState) {
  return {
    display: projectRuntimeDisplayToLegacy(state),
    readyHeadId: selectReadyHeadId(state),
    queueLength: state.items.queue.length,
    pendingCount: selectPendingCount(state),
    hasPending: selectHasPending(state),
  };
}
