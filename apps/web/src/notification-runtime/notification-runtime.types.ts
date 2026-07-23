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
export type DisplayMode = 'normal' | 'direct-overboard';

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
  };
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
      type: 'BOOTSTRAP_COMPLETED';
      transitionId: string;
      items: NotificationItem[];
      pendingItemIds: string[];
      sourceVersion: string | null;
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
    };

export type NotificationRuntimeEvent =
  | NotificationRuntimeCommand
  | NotificationRuntimeResultEvent;

export type RuntimeEffect =
  | { type: 'FETCH_PENDING'; transitionId: string; source: RuntimeSource }
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
  if (item.kind === 'result') {
    return {
      kind: 'result',
      payload: { kind: 'result', result: item.result },
      mode: mode === 'direct-overboard' ? 'direct-overboard' : 'normal',
    };
  }
  if (item.kind === 'check') {
    return {
      kind: 'check',
      payload: { kind: 'check', ban: item.ban },
      mode: 'normal',
    };
  }
  return {
    kind: 'incoming',
    payload: { kind: 'incoming', ban: item.ban },
    mode: 'normal',
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
    },
  };
}
