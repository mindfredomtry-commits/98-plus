/**
 * Stage 7 Phase 2 — passive Host ↔ Runtime contract (Option B readiness only).
 * No display/overlay/Lobby/Product fields. Not mounted in production.
 */
import {
  selectCurrentItem,
  selectHasNext,
  selectIndicatorVisible,
  selectIsActionBlocked,
  selectIsBooting,
  selectIsRecovering,
  selectPendingCount,
  selectReadyHeadId,
} from './notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export type NotificationQueueReadModel = {
  readyItemId: string | null;
  pendingCount: number;
  queueLength: number;
  actionBlocked: boolean;
  booting: boolean;
  recovering: boolean;
  hasNext: boolean;
  indicatorVisible: boolean;
};

export type NotificationIntentResult = {
  accepted: boolean;
  reason?: string;
};

/** Public intents. No Product / Reply navigation. */
export type NotificationIntents = {
  accept(): Promise<NotificationIntentResult>;
  confirmCheck(completed: boolean): Promise<NotificationIntentResult>;
  dismissResult(
    reason?: 'close_result' | 'continue_chain',
  ): Promise<NotificationIntentResult>;
  dismissCurrent(
    reason?: 'user_dismiss' | 'system',
  ): Promise<NotificationIntentResult>;
  refresh(
    reason?: 'bootstrap' | 'reconnect' | 'user',
  ): Promise<NotificationIntentResult>;
};

/** @deprecated Prefer selectNotificationQueueReadModel. */
export type NotificationViewState = NotificationQueueReadModel & {
  phase: 'READY' | 'EMPTY' | 'BOOTING' | 'RECOVERING' | 'ACTION_PENDING';
  readyHeadId: string | null;
  readyHead: null;
  isProcessingAction: boolean;
};

export function selectNotificationQueueReadModel(
  state: NotificationRuntimeState,
): NotificationQueueReadModel {
  return {
    readyItemId: selectReadyHeadId(state),
    pendingCount: selectPendingCount(state),
    queueLength: state.items.queue.length,
    actionBlocked: selectIsActionBlocked(state),
    booting: selectIsBooting(state),
    recovering: selectIsRecovering(state),
    hasNext: selectHasNext(state),
    indicatorVisible: selectIndicatorVisible(state),
  };
}

/**
 * Passive read model for tests / residual callers.
 * readyHead is always null — Host must not render queue head as active.
 */
export function selectNotificationViewState(
  state: NotificationRuntimeState,
): NotificationViewState {
  const read = selectNotificationQueueReadModel(state);
  let phase: NotificationViewState['phase'];
  if (read.booting) phase = 'BOOTING';
  else if (read.recovering) phase = 'RECOVERING';
  else if (read.actionBlocked) phase = 'ACTION_PENDING';
  else if (read.readyItemId) phase = 'READY';
  else phase = 'EMPTY';

  return {
    ...read,
    phase,
    readyHeadId: read.readyItemId,
    readyHead: null,
    isProcessingAction: read.actionBlocked,
  };
}

export function selectReadyItem(
  state: NotificationRuntimeState,
): NotificationItem | null {
  return selectCurrentItem(state);
}

export function selectReadyItemId(
  state: NotificationRuntimeState,
): string | null {
  return selectReadyHeadId(state);
}

export { notificationItemId };
