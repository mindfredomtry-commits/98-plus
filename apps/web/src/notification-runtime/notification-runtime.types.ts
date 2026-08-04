/**
 * Stage 8 Phase 8 — Notifications Runtime state (single Sync V1 model).
 *
 * One store, one state model, one reconcile authority.
 * Temporary presentation cache is not collection/FIFO authority.
 */
import type {
  BanInteraction,
  BanResult,
  NotificationItemV1,
  NotificationsDeltaV1,
  NotificationsSnapshotV1,
} from '@98plus/shared';
import {
  createInitialNotificationsReconcileStateV1,
  type NotificationsReconcileStateV1,
  type NotificationsSyncStatusV1,
} from './notification-runtime.sync-types';

export type RuntimeSource =
  | 'bootstrap'
  | 'deeplink'
  | 'websocket'
  | 'poll'
  | 'recovery'
  | 'user'
  | 'system'
  | 'test';

/** Legacy presentation payload (temporary until Sync Mapper cutover). */
export type NotificationItem =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export type NotificationItemKind = 'incoming' | 'check' | 'result';

export type CardActionType =
  | 'check_answer'
  | 'incoming_overboard'
  | 'result_ack';

export type CardDismissReason =
  | 'user_dismiss'
  | 'close_result'
  | 'continue_chain'
  | 'system';

export type NotificationsActivationOutcome =
  | { type: 'ACTIVATED'; itemId: string }
  | { type: 'ALREADY_ACTIVE'; itemId: string }
  | { type: 'NO_READY_ITEM' }
  | { type: 'SYNC_NOT_READY' };

/**
 * Single Runtime state = Phase 7 reconcile fields + isolated non-authority meta.
 */
export type NotificationRuntimeState = NotificationsReconcileStateV1 & {
  /**
   * Presentation-only cache keyed by itemId.
   * Must never be used for FIFO, activation, or action targeting.
   * Written only alongside APPLY_* from the temporary input adapter.
   */
  presentationByItemId: Readonly<Record<string, NotificationItem>>;
  /** Last typed reconcile conflict (does not clear items). */
  lastConflict:
    | {
        type:
          | 'REVISION_GAP'
          | 'ACTIVE_ITEM_CONFLICT'
          | 'ACTIVE_ITEM_REMOVE_CONFLICT'
          | 'INVALID_CONTRACT';
        detail: string;
      }
    | null;
  /** In-flight sync transition (status only; does not clear items). */
  syncTransitionId: string | null;
};

export type NotificationRuntimeCommand =
  | {
      type: 'SYNC_STARTED';
      transitionId: string;
      source: RuntimeSource;
    }
  | {
      type: 'SYNC_RECOVERY_STARTED';
      transitionId: string;
      source: RuntimeSource;
    }
  | {
      type: 'SYNC_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1';
      transitionId: string;
      snapshot: NotificationsSnapshotV1;
      /** Temporary presentation map for items in this snapshot. */
      presentationByItemId?: Readonly<Record<string, NotificationItem>>;
      source: RuntimeSource;
    }
  | {
      type: 'APPLY_NOTIFICATIONS_DELTA_V1';
      transitionId: string;
      delta: NotificationsDeltaV1;
      presentationByItemId?: Readonly<Record<string, NotificationItem>>;
      /** Authorize REMOVE of the active item after confirmed action. */
      activeRemoveAuthorization?: { actionId: string; itemId: string };
      /** After authorized active REMOVE, promote causal next if set. */
      promoteCausalNext?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'ACTIVATE_READY_ITEM_REQUESTED';
      source: RuntimeSource;
    }
  | {
      /** User CLOSE: return active to passive FIFO; release owner once. */
      type: 'ACTIVE_ITEM_CLOSE_REQUESTED';
      source: RuntimeSource;
    }
  | {
      type: 'CLEAR_ACTIVATION_REQUESTED';
      source: RuntimeSource;
    }
  | {
      type: 'CARD_ACTION_REQUESTED';
      commandId: string;
      targetItemId: string;
      action: CardActionType;
      completed?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'CARD_ACTION_SUCCEEDED';
      commandId: string;
      targetItemId: string;
      /** Confirmed ops to apply through reconcile (REMOVE/UPSERT). */
      delta?: NotificationsDeltaV1;
      presentationByItemId?: Readonly<Record<string, NotificationItem>>;
      promoteCausalNext?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'CARD_ACTION_FAILED';
      commandId: string;
      targetItemId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      type: 'RESET_REQUESTED';
      source: RuntimeSource;
    };

export type NotificationRuntimeEvent = NotificationRuntimeCommand;

export type RuntimeEffect =
  | { type: 'REQUEST_FULL_SYNC'; reason: string }
  | {
      type: 'SUBMIT_CARD_ACTION';
      commandId: string;
      targetItemId: string;
      action: CardActionType;
      completed?: boolean;
    }
  | { type: 'SESSION_COMPLETE'; reason: 'action' | 'close' | 'no_ready' }
  | { type: 'REFRESH_PENDING'; reason: string };

export type NotificationRuntimeReducerResult = {
  state: NotificationRuntimeState;
  effects: RuntimeEffect[];
  activationOutcome?: NotificationsActivationOutcome;
};

export type { NotificationsSyncStatusV1, NotificationItemV1 };

export function createInitialNotificationRuntimeState(): NotificationRuntimeState {
  const base = createInitialNotificationsReconcileStateV1();
  return {
    ...base,
    presentationByItemId: {},
    lastConflict: null,
    syncTransitionId: null,
  };
}

/** Stable Contract V1 item id (preferred). */
export function notificationItemIdFromV1(item: NotificationItemV1): string {
  return item.itemId;
}

/** Legacy presentation item id — adapter / presenter only. */
export function notificationItemId(item: NotificationItem): string {
  if (item.kind === 'result') {
    return `result:${String(item.result.id)}`;
  }
  if (item.kind === 'check') {
    return `check:${String(item.ban.id)}`;
  }
  return `incoming:${String(item.ban.id)}`;
}
