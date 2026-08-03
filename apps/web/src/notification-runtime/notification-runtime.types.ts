/**
 * Stage 8 Phase 5 — Notification Runtime contract.
 * Queue + item lifecycle + explicit activation (domain processing claim).
 * No display/overlay/CSS/React ownership.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';

export type RuntimeSource =
  | 'bootstrap'
  | 'deeplink'
  | 'websocket'
  | 'poll'
  | 'recovery'
  | 'user'
  | 'system'
  | 'test';

export type NotificationItemKind = 'incoming' | 'check' | 'result';

/** Queue item — product kinds only. */
export type NotificationItem =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

/**
 * Queue / reconciliation lifecycle. Not a visual ownership state.
 * Writers: bootstrap/reconnect (booting/recovering), actions (submitting), idle otherwise.
 */
export type LifecycleStatus = 'booting' | 'idle' | 'submitting' | 'recovering';

export type ActionStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

export type RecoveryStatus = 'idle' | 'loading' | 'applied' | 'failed';

export type DirectEntrySource = 'deeplink' | 'live-single';
/** Queue retention after direct ingest. Return navigation is out of Runtime scope. */
export type DirectReturnPolicy = 'retain_queue';

export type DeferredDirectEntry = {
  transitionId: string;
  targetId: string;
  targetKind: NotificationItemKind | null;
  entrySource: DirectEntrySource;
  returnPolicy: DirectReturnPolicy;
};

export type DirectEntryState = {
  active: boolean;
  transitionId: string | null;
  targetId: string | null;
  targetKind: NotificationItemKind | null;
  entrySource: DirectEntrySource | null;
  returnPolicy: DirectReturnPolicy | null;
  /** Newer request while another direct fetch is active. */
  deferred: DeferredDirectEntry | null;
};

/**
 * Domain processing claim — not presentation/display state.
 * INACTIVE: queue may hold ready items; none claimed.
 * ACTIVE: Notifications domain has explicitly claimed itemId.
 */
export type NotificationActivationState =
  | { type: 'INACTIVE' }
  | { type: 'ACTIVE'; itemId: string };

export type NotificationRuntimeState = {
  lifecycle: {
    status: LifecycleStatus;
    source: RuntimeSource | null;
    transitionId: string | null;
  };
  items: {
    /** FIFO; ready head is always queue[0] (derived, not stored). */
    queue: NotificationItem[];
  };
  /**
   * Explicit activation claim. Never set by ingest/bootstrap/websocket.
   * Distinct from ready head (queue[0]).
   */
  activation: NotificationActivationState;
  action: {
    status: ActionStatus;
    commandId: string | null;
    targetItemId: string | null;
    errorCode: string | null;
  };
  pending: {
    /** Canonical unread item IDs (kind:id). */
    itemIds: string[];
    sourceVersion: string | null;
    /**
     * Monotonic authority generation of the last applied snapshot.
     * Stamped when a request starts, so a late empty response from an older
     * request cannot clear a newer non-empty snapshot (out-of-order guard).
     */
    generation: number;
  };
  consumed: {
    itemIds: string[];
  };
  recovery: {
    status: RecoveryStatus;
    snapshotVersion: string | null;
    /** Active bootstrap/recovery fetch id (survives direct-entry preserve). */
    transitionId: string | null;
  };
  /** Deeplink / live-single session (ingest only). */
  directEntry: DirectEntryState;
};

export type CardActionType =
  | 'check_answer'
  | 'incoming_overboard'
  /** Explicit user dismiss of a result card → POST /bans/:id/result/ack */
  | 'result_ack';

export type CardDismissReason =
  | 'user_dismiss'
  | 'close_result'
  | 'continue_chain'
  | 'system';

export type NotificationRuntimeCommand =
  | {
      type: 'BOOTSTRAP_REQUESTED';
      transitionId: string;
      source: RuntimeSource;
    }
  | {
      type: 'DEEPLINK_ENTRY_REQUESTED';
      transitionId: string;
      targetId: string;
      targetKind?: NotificationItemKind | null;
      entrySource: DirectEntrySource;
      returnPolicy: DirectReturnPolicy;
      /** Park without FETCH yet when another direct fetch is active. */
      defer?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'CARD_ACTION_REQUESTED';
      commandId: string;
      targetItemId: string;
      action: CardActionType;
      /** For check_answer: whether the viewer completed the challenge. */
      completed?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'CARD_DISMISS_REQUESTED';
      transitionId: string;
      targetItemId: string;
      reason: CardDismissReason;
      source: RuntimeSource;
    }
  | {
      type: 'ITEM_COMPLETED';
      transitionId: string;
      targetItemId: string;
      source: RuntimeSource;
    }
  | {
      /**
       * Explicit domain claim of ready head. Never emitted by ingest.
       * No-op when already ACTIVE; no-op manufacturing when queue empty.
       */
      type: 'ACTIVATE_READY_ITEM_REQUESTED';
      source: RuntimeSource;
    }
  | {
      /** Clear activation claim without consuming queue items. */
      type: 'CLEAR_ACTIVATION_REQUESTED';
      source: RuntimeSource;
    }
  | {
      type: 'RESET_REQUESTED';
      source: RuntimeSource;
    };

export type NotificationRuntimeResultEvent =
  | {
      type: 'ITEMS_RECEIVED';
      transitionId: string;
      items: NotificationItem[];
      /** When true, replace queue; otherwise merge/dedupe onto queue. */
      replaceQueue?: boolean;
      source: RuntimeSource;
    }
  | {
      type: 'BOOTSTRAP_SNAPSHOT_RECEIVED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      consumedItemIds?: string[];
      sourceVersion: string | null;
      source: RuntimeSource;
      generation?: number | null;
    }
  | {
      type: 'BOOTSTRAP_COMPLETED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      consumedItemIds?: string[];
      sourceVersion: string | null;
      source: RuntimeSource;
      generation?: number | null;
    }
  | {
      type: 'BOOTSTRAP_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      type: 'CARD_ACTION_SUCCEEDED';
      commandId: string;
      targetItemId: string;
      /** Atomic check→result replacement when present. */
      replacement?: NotificationItem;
      /** Consume current head after successful action. */
      consumeAndAdvance?: boolean;
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
      type: 'PENDING_SOURCE_UPDATED';
      itemIds: string[];
      sourceVersion: string | null;
      source: RuntimeSource;
      generation?: number | null;
    }
  | {
      /** Local consume tombstone; does not touch queue/lifecycle. */
      type: 'ITEM_CONSUMED';
      itemId: string;
      source: RuntimeSource;
    }
  | {
      type: 'DIRECT_ITEM_RECEIVED';
      transitionId: string;
      item: NotificationItem;
      source: RuntimeSource;
    }
  | {
      type: 'DIRECT_ITEM_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      type: 'DIRECT_ENTRY_FLUSH_REQUESTED';
      source: RuntimeSource;
    };

export type NotificationRuntimeEvent =
  | NotificationRuntimeCommand
  | NotificationRuntimeResultEvent;

export type RuntimeEffect =
  | { type: 'FETCH_PENDING'; transitionId: string; source: RuntimeSource }
  | {
      type: 'FETCH_DIRECT_ITEM';
      transitionId: string;
      targetId: string;
      targetKind: NotificationItemKind | null;
      entrySource: DirectEntrySource;
      source: RuntimeSource;
    }
  | {
      type: 'SUBMIT_CARD_ACTION';
      commandId: string;
      targetItemId: string;
      action: CardActionType;
      completed?: boolean;
    }
  | { type: 'MARK_CONSUMED'; itemId: string }
  | { type: 'REFRESH_PENDING'; reason: string }
  | { type: 'PREFETCH_NEXT'; skipItemId?: string };

export type NotificationRuntimeReducerResult = {
  state: NotificationRuntimeState;
  effects: RuntimeEffect[];
};

/** Stable dedupe / pending key. */
export function notificationItemId(item: NotificationItem): string {
  const id =
    item.kind === 'result'
      ? normalizeId(item.result.id)
      : normalizeId(item.ban.id);
  return `${item.kind}:${id}`;
}

export function createEmptyDirectEntryState(): DirectEntryState {
  return {
    active: false,
    transitionId: null,
    targetId: null,
    targetKind: null,
    entrySource: null,
    returnPolicy: null,
    deferred: null,
  };
}

export function createInitialNotificationRuntimeState(): NotificationRuntimeState {
  return {
    lifecycle: {
      status: 'idle',
      source: null,
      transitionId: null,
    },
    items: { queue: [] },
    activation: { type: 'INACTIVE' },
    action: {
      status: 'idle',
      commandId: null,
      targetItemId: null,
      errorCode: null,
    },
    pending: {
      itemIds: [],
      sourceVersion: null,
      generation: 0,
    },
    consumed: {
      itemIds: [],
    },
    recovery: {
      status: 'idle',
      snapshotVersion: null,
      transitionId: null,
    },
    directEntry: createEmptyDirectEntryState(),
  };
}
