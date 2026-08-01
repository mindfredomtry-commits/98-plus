/**
 * App Coordinator foundation.
 *
 * Stage 7 Phase 3 — temporary modes: BOOTING | PRODUCT only.
 * Notification activation and reply-compose ownership are not built yet.
 * EntryIntent.NOTIFICATION remains ingest-only (not AppMode).
 */

export type ProductRoute =
  | 'LOBBY'
  | 'WHO'
  | 'WHAT'
  | 'CONFIRM'
  | 'SUCCESS'
  | 'BANS';

export type AppMode =
  | { type: 'BOOTING' }
  | { type: 'PRODUCT'; route: ProductRoute };

/** Product return destination after exclusive Product flows. */
export type ProductResumeDestination = {
  type: 'PRODUCT';
  route: ProductRoute;
};

export type ResumeDestination = ProductResumeDestination;

export type AppCoordinatorState = {
  mode: AppMode;
  resumeDestination: ResumeDestination;
};

export type NotificationEntryKind = 'incoming' | 'status';

/**
 * Launch entry intent. NOTIFICATION means Runtime ingest only —
 * it does not select a Notification AppMode (none exists until ACTIVATE).
 */
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
      productRoute?: ProductRoute;
    }
  | { type: 'ENTRY_ROUTED'; intent: AppEntryIntent }
  | { type: 'PRODUCT_COMPOSE_REQUESTED' }
  | { type: 'PRODUCT_ROUTE_CHANGED'; route: ProductRoute }
  | {
      type: 'PRODUCT_FLOW_RELEASED';
      route: ProductRoute;
    }
  | { type: 'RECONNECT_STARTED' }
  | { type: 'RECONNECT_COMPLETED' };

export type RuntimeCoordinatorCommand =
  | { type: 'INGEST_ENTRY'; intent: Extract<EntryIntent, { type: 'NOTIFICATION' }> }
  | { type: 'FLUSH_DEFERRED_DIRECT_ENTRY' };

export type ProductCoordinatorCommand = {
  type: 'OPEN_ROUTE';
  route: ProductRoute;
};

export type AppCoordinatorEffect =
  | { target: 'NOTIFICATION_RUNTIME'; command: RuntimeCoordinatorCommand }
  | { target: 'PRODUCT_FLOW'; command: ProductCoordinatorCommand };

export type AppCoordinatorResult = {
  state: AppCoordinatorState;
  effects: AppCoordinatorEffect[];
  violation: AppCoordinatorInvariantViolation | null;
};

/** No reply/notification invariants remain until Coordinator ACTIVATE. */
export type AppCoordinatorInvariantCode = 'UNEXPECTED_EVENT';

export type AppCoordinatorInvariantViolation = {
  code: AppCoordinatorInvariantCode;
  eventType: AppCoordinatorEvent['type'];
  message: string;
};

export function createInitialAppCoordinatorState(): AppCoordinatorState {
  return {
    mode: { type: 'BOOTING' },
    resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
  };
}
