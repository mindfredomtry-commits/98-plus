import type {
  AppCoordinatorEvent,
  EntryIntent,
  ProductRoute,
} from './app-coordinator.types';

export type NotificationEntryIntent = Extract<
  EntryIntent,
  { type: 'NOTIFICATION' }
>;

/** Coordinator → Runtime commands. No activation / reply ownership. */
export interface NotificationRuntimePort {
  ingestEntry(intent: NotificationEntryIntent): void;
  /** Flush deferred deeplink ingest after Product exclusive flow releases. */
  flushDeferredDirectEntry(): void;
}

export interface ProductFlowPort {
  openRoute(input: { route: ProductRoute }): void;
}

export interface NotificationRuntimeEventSink {
  /** Cold bootstrap settled. Coordinator alone decides mode (always Product). */
  bootCompleted(input?: { productRoute?: ProductRoute }): void;
  reconnectStarted(): void;
  reconnectCompleted(): void;
}

/**
 * Product → Coordinator facts.
 * Reply cancel/complete are accepted as no-ops until Coordinator ACTIVATE/reply.
 */
export interface ProductFlowEventSink {
  routeChanged(route: ProductRoute): void;
  replyCancelled(input: {
    resumeToken: string;
    sourceItemId: string;
  }): void;
  replyCompleted(input: {
    resumeToken: string;
    sourceItemId: string;
  }): void;
  flowReleased(route: ProductRoute): void;
}

export type AppCoordinatorEventDispatcher = (
  event: AppCoordinatorEvent,
) => void;

export function createNotificationRuntimeEventSink(
  dispatch: AppCoordinatorEventDispatcher,
): NotificationRuntimeEventSink {
  return {
    bootCompleted(input) {
      dispatch({
        type: 'BOOT_COMPLETED',
        productRoute: input?.productRoute,
      });
    },
    reconnectStarted() {
      dispatch({ type: 'RECONNECT_STARTED' });
    },
    reconnectCompleted() {
      dispatch({ type: 'RECONNECT_COMPLETED' });
    },
  };
}

export function createProductFlowEventSink(
  dispatch: AppCoordinatorEventDispatcher,
): ProductFlowEventSink {
  return {
    routeChanged(route) {
      dispatch({ type: 'PRODUCT_ROUTE_CHANGED', route });
    },
    replyCancelled() {
      // Stage 7 Phase 3 — reply ownership not in Coordinator yet.
    },
    replyCompleted() {
      // Stage 7 Phase 3 — reply ownership not in Coordinator yet.
    },
    flowReleased(route) {
      dispatch({ type: 'PRODUCT_FLOW_RELEASED', route });
    },
  };
}
