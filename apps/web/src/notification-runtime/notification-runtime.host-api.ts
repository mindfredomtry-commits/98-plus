/**
 * Stage 8 Phase 8 — passive read model for host intents.
 */
import {
  selectActiveItem,
  selectActiveItemId,
  selectIsActionBlocked,
  selectPassiveItemIds,
  selectReadyHeadId,
  selectSyncStatus,
} from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

export type NotificationIntentResult = {
  accepted: boolean;
  reason?: string;
};

export type NotificationIntents = {
  accept(): Promise<NotificationIntentResult>;
  confirmCheck(completed: boolean): Promise<NotificationIntentResult>;
  dismissResult(reason?: string): Promise<NotificationIntentResult>;
  dismissCurrent(reason?: string): Promise<NotificationIntentResult>;
  refresh(reason?: 'bootstrap' | 'reconnect' | 'user'): Promise<NotificationIntentResult>;
};

export type NotificationQueueReadModel = {
  activeItemId: string | null;
  readyHeadId: string | null;
  passiveCount: number;
  actionBlocked: boolean;
  syncStatus: NotificationRuntimeState['syncStatus'];
};

export function selectNotificationQueueReadModel(
  state: NotificationRuntimeState,
): NotificationQueueReadModel {
  return {
    activeItemId: selectActiveItemId(state),
    readyHeadId: selectReadyHeadId(state),
    passiveCount: selectPassiveItemIds(state).length,
    actionBlocked: selectIsActionBlocked(state),
    syncStatus: selectSyncStatus(state),
  };
}

export function selectReadyItem(state: NotificationRuntimeState) {
  const id = selectReadyHeadId(state);
  if (!id) return null;
  return state.presentationByItemId[id] ?? null;
}

export function selectReadyItemId(state: NotificationRuntimeState) {
  return selectReadyHeadId(state);
}

export function selectNotificationViewState(state: NotificationRuntimeState) {
  return {
    activeItemId: selectActiveItemId(state),
    activeItem: selectActiveItem(state),
    actionStatus: state.action.status,
  };
}

export { notificationItemId };
