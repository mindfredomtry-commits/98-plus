/**
 * App Coordinator foundation.
 *
 * This is the only contract that decides which subsystem owns the application
 * surface. It contains no React, transport, Runtime store, or Product state.
 */

export type ProductRoute =
  | 'LOBBY'
  | 'WHO'
  | 'WHAT'
  | 'CONFIRM'
  | 'SUCCESS'
  | 'BANS';

export type ReplyComposeRoute = 'WHAT' | 'CONFIRM' | 'SUCCESS';

declare const resumeTokenBrand: unique symbol;

/** Opaque reply suspension identity. Created only by ResumeTokenFactory. */
export type ResumeToken = string & {
  readonly [resumeTokenBrand]: 'ResumeToken';
};

export type AppMode =
  | { type: 'BOOTING' }
  | { type: 'PRODUCT'; route: ProductRoute }
  | { type: 'NOTIFICATION'; itemId: string }
  | {
      type: 'REPLY_COMPOSE';
      sourceItemId: string;
      targetUserId: string;
      resumeToken: ResumeToken;
      route: ReplyComposeRoute;
      completionPending: boolean;
    };

export type ProductResumeDestination = {
  type: 'PRODUCT';
  route: ProductRoute;
};

export type NotificationResumeDestination = {
  type: 'NOTIFICATION';
  itemId: string;
  afterQueue: ProductResumeDestination;
};

/**
 * Immediate destination after the active exclusive flow releases ownership.
 * Notification destinations retain the eventual Product route after drain.
 */
export type ResumeDestination =
  | ProductResumeDestination
  | NotificationResumeDestination;

export type AppCoordinatorState = {
  mode: AppMode;
  resumeDestination: ResumeDestination;
  /** Bounded single-record ledger for duplicate terminal reply facts. */
  lastSettledReply: {
    resumeToken: ResumeToken;
    sourceItemId: string;
    outcome: 'cancelled' | 'completed';
  } | null;
};

export type NotificationEntryKind = 'incoming' | 'status';

export type EntryIntent =
  | { type: 'PRODUCT'; route: ProductRoute }
  | {
      type: 'NOTIFICATION';
      itemId: string;
      notificationKind: NotificationEntryKind;
    };

/** Backward-compatible name for the pure foundation tests. */
export type AppEntryIntent = EntryIntent;

export type AppCoordinatorEvent =
  | { type: 'APP_STARTED' }
  | {
      type: 'BOOT_COMPLETED';
      currentNotificationItemId: string | null;
      productRoute?: ProductRoute;
    }
  | { type: 'ENTRY_ROUTED'; intent: AppEntryIntent }
  | {
      /**
       * Runtime reports presentation authority. This is an integration event,
       * not a coordinator read of Runtime state.
       */
      type: 'RUNTIME_CURRENT_CHANGED';
      itemId: string;
    }
  | { type: 'RUNTIME_QUEUE_DRAINED' }
  | { type: 'PRODUCT_COMPOSE_REQUESTED' }
  | { type: 'PRODUCT_ROUTE_CHANGED'; route: ProductRoute }
  | {
      type: 'PRODUCT_FLOW_RELEASED';
      route: ProductRoute;
    }
  | {
      type: 'REPLY_REQUESTED';
      sourceItemId: string;
      targetUserId: string;
      resumeToken: ResumeToken;
    }
  | {
      type: 'REPLY_ROUTE_CHANGED';
      resumeToken: ResumeToken;
      route: ReplyComposeRoute;
    }
  | { type: 'REPLY_CANCELLED'; resumeToken: ResumeToken }
  | {
      type: 'REPLY_COMPLETED';
      resumeToken: ResumeToken;
      sourceItemId: string;
    }
  | {
      type: 'NOTIFICATION_SURFACE_UNAVAILABLE';
      expectedItemId: string;
      runtimeItemId: string | null;
      runtimePhase:
        | 'BOOTING'
        | 'LOBBY'
        | 'RECOVERING'
        | 'INCOMING'
        | 'CHECK'
        | 'RESULT';
    }
  | { type: 'RECONNECT_STARTED' }
  | { type: 'RECONNECT_COMPLETED' };

export type RuntimeCoordinatorCommand =
  | { type: 'INGEST_ENTRY'; intent: Extract<EntryIntent, { type: 'NOTIFICATION' }> }
  | {
      type: 'SUSPEND';
      sourceItemId: string | null;
      resumeToken: ResumeToken | null;
    }
  | {
      type: 'RESUME';
      resumeToken: ResumeToken | null;
    }
  | {
      type: 'COMPLETE_SOURCE_ITEM';
      sourceItemId: string;
      resumeToken: ResumeToken;
    };

export type ProductRouteContext =
  | {
      type: 'REPLY';
      sourceItemId: string;
      targetUserId: string;
      resumeToken: ResumeToken;
    };

export type ProductCoordinatorCommand = {
  type: 'OPEN_ROUTE';
  route: ProductRoute;
  context?: ProductRouteContext;
};

export type AppCoordinatorEffect =
  | { target: 'NOTIFICATION_RUNTIME'; command: RuntimeCoordinatorCommand }
  | { target: 'PRODUCT_FLOW'; command: ProductCoordinatorCommand };

export type AppCoordinatorResult = {
  state: AppCoordinatorState;
  effects: AppCoordinatorEffect[];
  violation: AppCoordinatorInvariantViolation | null;
};

export type AppCoordinatorInvariantCode =
  | 'NO_ACTIVE_REPLY_SUSPENSION'
  | 'REPLY_ALREADY_ACTIVE'
  | 'STALE_RESUME_TOKEN'
  | 'WRONG_REPLY_SOURCE_ITEM'
  | 'DUPLICATE_REPLY_COMPLETION'
  | 'DUPLICATE_REPLY_CANCELLATION'
  | 'REPLY_COMPLETED_BEFORE_SUCCESS'
  | 'RESUME_WITHOUT_ACTIVE_SUSPENSION'
  | 'NOTIFICATION_SURFACE_ITEM_UNAVAILABLE';

export type AppCoordinatorInvariantViolation = {
  code: AppCoordinatorInvariantCode;
  eventType: AppCoordinatorEvent['type'];
  message: string;
};

export function createInitialAppCoordinatorState(): AppCoordinatorState {
  return {
    mode: { type: 'BOOTING' },
    resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
    lastSettledReply: null,
  };
}
