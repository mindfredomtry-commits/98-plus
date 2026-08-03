/**
 * Notifications Runtime — target sync / reconcile state (Contract V1).
 *
 * Pure types for the future Sync path. Not yet wired to the production store.
 */
import type { NotificationItemV1 } from '@98plus/shared';

export type NotificationsSyncStatusV1 =
  | 'UNINITIALIZED'
  | 'SYNCING'
  | 'READY'
  | 'RECOVERING'
  | 'FAILED';

export type NotificationsReconcileActionStateV1 = {
  status: 'IDLE' | 'SUBMITTING' | 'FAILED';
  itemId: string | null;
  actionId: string | null;
  errorCode: string | null;
};

/**
 * Target synchronization state.
 * Identity lives only in itemsById; other fields hold IDs.
 */
export type NotificationsReconcileStateV1 = {
  syncStatus: NotificationsSyncStatusV1;
  revision: string | null;
  itemsById: Readonly<Record<string, NotificationItemV1>>;
  /** Passive FIFO order (sequence ASC). Never includes active or causalNext. */
  passiveItemIds: readonly string[];
  activeItemId: string | null;
  causalNextItemId: string | null;
  action: NotificationsReconcileActionStateV1;
};

export type NotificationsReconcileResultV1 =
  | { type: 'APPLIED'; state: NotificationsReconcileStateV1 }
  | { type: 'STALE_IGNORED'; state: NotificationsReconcileStateV1 }
  | {
      type: 'REVISION_GAP';
      state: NotificationsReconcileStateV1;
      expected: string;
      received: string;
    }
  | {
      type: 'ACTIVE_ITEM_CONFLICT';
      state: NotificationsReconcileStateV1;
      itemId: string;
      reason: 'MISSING_FROM_SNAPSHOT';
    }
  | {
      type: 'ACTIVE_ITEM_REMOVE_CONFLICT';
      state: NotificationsReconcileStateV1;
      itemId: string;
    }
  | {
      type: 'INVALID_CONTRACT';
      state: NotificationsReconcileStateV1;
      reason: string;
    };

/** Correlated action completion authorizing REMOVE of the active item. */
export type ActiveRemoveAuthorizationV1 = {
  actionId: string;
  itemId: string;
};

export type NotificationsAvailabilityV1 =
  | { available: true }
  | {
      available: false;
      reason:
        | 'UNINITIALIZED'
        | 'SYNCING'
        | 'RECOVERING'
        | 'FAILED'
        | 'EMPTY'
        | 'ACTION_TARGET_MISSING';
      retryable: boolean;
    };

export type ActionTargetV1 =
  | { ok: true; itemId: string; item: NotificationItemV1 }
  | { ok: false; reason: 'NO_ACTIVE_ITEM' | 'ACTIVE_ITEM_MISSING' };

export function createInitialNotificationsReconcileStateV1(): NotificationsReconcileStateV1 {
  return {
    syncStatus: 'UNINITIALIZED',
    revision: null,
    itemsById: {},
    passiveItemIds: [],
    activeItemId: null,
    causalNextItemId: null,
    action: {
      status: 'IDLE',
      itemId: null,
      actionId: null,
      errorCode: null,
    },
  };
}
