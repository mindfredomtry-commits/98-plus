/**
 * Vertical 0 — Single Owner notification runtime contract (offline pure).
 * Not wired to production Providers / overlays / transport.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';

export type RuntimeSource =
  | 'bootstrap'
  | 'drain'
  | 'deeplink'
  | 'websocket'
  | 'poll'
  | 'recovery'
  | 'user'
  | 'system'
  | 'test';

export type NotificationItemKind = 'incoming' | 'check' | 'result';

/**
 * Queue item — product kinds only.
 * Overboard is display.mode on a result item, not a separate kind.
 * stable/reply/scoped are presentation pins, not queue kinds.
 */
export type NotificationItem =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export type DisplayKind = NotificationItemKind;
/** Vertical 6: `direct` = deeplink/live-single session; overboard is result presentation. */
export type DisplayMode = 'normal' | 'direct' | 'direct-overboard';

export type DisplayPayload =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export type LifecycleStatus =
  | 'booting'
  | 'idle'
  | 'draining'
  | 'showing'
  | 'submitting'
  | 'completing'
  | 'recovering';

export type ActionStatus = 'idle' | 'pending' | 'succeeded' | 'failed';

export type RecoveryStatus = 'idle' | 'loading' | 'applied' | 'failed';

/** Vertical 6 — deeplink / live-single entry metadata (not a second owner). */
export type DirectEntrySource = 'deeplink' | 'live-single';
export type DirectReturnPolicy = 'lobby_after_card';

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
  /** Newer request while blocked or while another direct is showing. */
  deferred: DeferredDirectEntry | null;
};

export type NotificationRuntimeState = {
  lifecycle: {
    status: LifecycleStatus;
    source: RuntimeSource | null;
    transitionId: string | null;
  };
  items: {
    /** FIFO; current is always queue[0] (derived, not stored). */
    queue: NotificationItem[];
  };
  display: {
    kind: DisplayKind | null;
    payload: DisplayPayload | null;
    mode: DisplayMode;
  };
  action: {
    status: ActionStatus;
    commandId: string | null;
    targetItemId: string | null;
    errorCode: string | null;
  };
  pending: {
    /** Canonical unread item IDs (overlayQueueKey form: kind:id). */
    itemIds: string[];
    sourceVersion: string | null;
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
  /** Vertical 6 — sole direct-entry session (deeplink / live-single). */
  directEntry: DirectEntryState;
};

export type CardActionType = 'check_answer' | 'incoming_reply' | 'incoming_overboard';

export type CardDismissReason =
  | 'user_dismiss'
  | 'go_to_bans'
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
      type: 'DRAIN_REQUESTED';
      transitionId: string;
      source: RuntimeSource;
    }
  | {
      /** Vertical 5 — SUCCESS product screen finished; runtime owns handoff. */
      type: 'SUCCESS_HANDOFF_REQUESTED';
      transitionId: string;
      source: RuntimeSource;
    }
  | {
      /**
       * Vertical 6 — deeplink / live-single direct entry.
       * Host sets `defer` when SUCCESS / compose / product-exclusive blocks display.
       */
      type: 'DEEPLINK_ENTRY_REQUESTED';
      transitionId: string;
      targetId: string;
      targetKind?: NotificationItemKind | null;
      entrySource: DirectEntrySource;
      returnPolicy: DirectReturnPolicy;
      /** Host: SUCCESS / draining / compose — park without FETCH yet if true. */
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
      type: 'LOBBY_REQUESTED';
      source: RuntimeSource;
    }
  | {
      type: 'RESET_REQUESTED';
      source: RuntimeSource;
    }
  | {
      type: 'RECOVERY_REQUESTED';
      transitionId: string;
      source: RuntimeSource;
    };

export type NotificationRuntimeResultEvent =
  | {
      type: 'ITEMS_RECEIVED';
      transitionId: string;
      items: NotificationItem[];
      /** When true, replace draining queue; otherwise merge/dedupe onto queue. */
      replaceQueue?: boolean;
      source: RuntimeSource;
    }
    | {
      /**
       * Vertical 7 — transport delivered boot snapshot.
       * Alias path: same decision surface as BOOTSTRAP_COMPLETED.
       */
      type: 'BOOTSTRAP_SNAPSHOT_RECEIVED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      /** Local/server consumed tombstones (short TTL — never infinite). */
      consumedItemIds?: string[];
      /**
       * real-time → show queue head; normal → pending/badge only (no auto-show).
       */
      autoShow: boolean;
      sourceVersion: string | null;
      source: RuntimeSource;
    }
  | {
      type: 'BOOTSTRAP_COMPLETED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      consumedItemIds?: string[];
      /** When false (normal mode), park in pending only — no overlay. */
      autoShow?: boolean;
      sourceVersion: string | null;
      source: RuntimeSource;
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
      displayMode?: DisplayMode;
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
    }
  | {
      /** Vertical 4 — local consume tombstone; does not touch queue/lifecycle. */
      type: 'ITEM_CONSUMED';
      itemId: string;
      source: RuntimeSource;
    }
  | {
      type: 'RECOVERY_APPLIED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      consumedItemIds: string[];
      sourceVersion: string | null;
      snapshotVersion: string | null;
      source: RuntimeSource;
    }
  | {
      type: 'RECOVERY_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      /** Vertical 5 — prefetch/materialize failed; go idle + lobbyMayShow. */
      type: 'DRAIN_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      /** Vertical 6 — direct fetch succeeded; place item at head (mode=direct). */
      type: 'DIRECT_ITEM_RECEIVED';
      transitionId: string;
      item: NotificationItem;
      source: RuntimeSource;
    }
  | {
      /** Vertical 6 — direct fetch failed / not found. */
      type: 'DIRECT_ITEM_FAILED';
      transitionId: string;
      errorCode: string;
      source: RuntimeSource;
    }
  | {
      /** Vertical 6 — host allows a deferred direct entry to start (idle boundary). */
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
  | { type: 'PREFETCH_NEXT'; skipItemId?: string }
  | {
      type: 'ANALYTICS_EVENT';
      name: string;
      fields?: Record<string, string | number | boolean | null>;
    };

export type NotificationRuntimeReducerResult = {
  state: NotificationRuntimeState;
  effects: RuntimeEffect[];
};

/** Stable dedupe / pending key — matches legacy overlayQueueKey. */
export function notificationItemId(item: NotificationItem): string {
  // Match overlayQueueKey so production dismiss targets align.
  const id =
    item.kind === 'result'
      ? normalizeId(item.result.id)
      : normalizeId(item.ban.id);
  return `${item.kind}:${id}`;
}

export function displayFromItem(
  item: NotificationItem,
  mode: DisplayMode = 'normal',
): NotificationRuntimeState['display'] {
  const resolvedMode: DisplayMode =
    mode === 'direct-overboard' && item.kind === 'result'
      ? 'direct-overboard'
      : mode === 'direct'
        ? 'direct'
        : 'normal';
  if (item.kind === 'result') {
    return {
      kind: 'result',
      payload: { kind: 'result', result: item.result },
      mode: resolvedMode,
    };
  }
  if (item.kind === 'check') {
    return {
      kind: 'check',
      payload: { kind: 'check', ban: item.ban },
      mode: resolvedMode === 'direct' ? 'direct' : 'normal',
    };
  }
  return {
    kind: 'incoming',
    payload: { kind: 'incoming', ban: item.ban },
    mode: resolvedMode === 'direct' ? 'direct' : 'normal',
  };
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
    display: {
      kind: null,
      payload: null,
      mode: 'normal',
    },
    action: {
      status: 'idle',
      commandId: null,
      targetItemId: null,
      errorCode: null,
    },
    pending: {
      itemIds: [],
      sourceVersion: null,
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
