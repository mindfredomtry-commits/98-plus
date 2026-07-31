/**
 * Stage 7 Phase 1 — passive Host ↔ Runtime contract.
 * Exposes ready-head / queue / action status. No Lobby/CTA/Product fields.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
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

export type NotificationHostPhase =
  | 'READY'
  | 'EMPTY'
  | 'BOOTING'
  | 'RECOVERING'
  | 'ACTION_PENDING';

export type NotificationCard =
  | { kind: 'incoming'; itemId: string; ban: BanInteraction }
  | { kind: 'check'; itemId: string; ban: BanInteraction }
  | { kind: 'result'; itemId: string; result: BanResult };

export type NotificationViewState = {
  phase: NotificationHostPhase;
  /** Ready FIFO head — not an activated surface claim. */
  readyHead: NotificationCard | null;
  readyHeadId: string | null;
  queueLength: number;
  pendingCount: number;
  indicatorVisible: boolean;
  isProcessingAction: boolean;
  hasNext: boolean;
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

function cardFromItem(item: NotificationItem): NotificationCard {
  const itemId = notificationItemId(item);
  if (item.kind === 'result') {
    return { kind: 'result', itemId, result: item.result };
  }
  if (item.kind === 'check') {
    return { kind: 'check', itemId, ban: item.ban };
  }
  return { kind: 'incoming', itemId, ban: item.ban };
}

/**
 * Passive read model. Ready head may exist without any application surface claim.
 */
export function selectNotificationViewState(
  state: NotificationRuntimeState,
): NotificationViewState {
  const isProcessingAction = selectIsActionBlocked(state);
  const pendingCount = selectPendingCount(state);
  const indicatorVisible = selectIndicatorVisible(state);
  const hasNext = selectHasNext(state);
  const queueLength = state.items.queue.length;
  const head = selectCurrentItem(state);
  const readyHead = head ? cardFromItem(head) : null;
  const readyHeadId = selectReadyHeadId(state);

  let phase: NotificationHostPhase;
  if (selectIsBooting(state)) {
    phase = 'BOOTING';
  } else if (selectIsRecovering(state)) {
    phase = 'RECOVERING';
  } else if (isProcessingAction) {
    phase = 'ACTION_PENDING';
  } else if (readyHead) {
    phase = 'READY';
  } else {
    phase = 'EMPTY';
  }

  return {
    phase,
    readyHead,
    readyHeadId,
    queueLength,
    pendingCount,
    indicatorVisible,
    isProcessingAction,
    hasNext,
  };
}
