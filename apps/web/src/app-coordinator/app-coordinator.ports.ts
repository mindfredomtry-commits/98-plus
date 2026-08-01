import type {
  AppCoordinatorEvent,
  EntryIntent,
  ProductRoute,
  ProductRouteContext,
  ResumeToken,
} from './app-coordinator.types';

export type NotificationEntryIntent = Extract<
  EntryIntent,
  { type: 'NOTIFICATION' }
>;

export interface NotificationRuntimePort {
  ingestEntry(intent: NotificationEntryIntent): void;
  suspend(input: {
    sourceItemId: string | null;
    resumeToken: ResumeToken | null;
  }): void;
  resume(input: { resumeToken: ResumeToken | null }): void;
  completeSourceItem(input: {
    sourceItemId: string;
    resumeToken: ResumeToken;
  }): void;
}

export interface ProductFlowPort {
  openRoute(input: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void;
}

export interface NotificationRuntimeEventSink {
  /**
   * Runtime reports that cold bootstrap settled. Coordinator alone decides mode.
   * Production always supplies currentItemId: null (no auto-activation).
   */
  bootCompleted(input: {
    currentItemId: string | null;
    productRoute?: ProductRoute;
  }): void;
  reconnectStarted(): void;
  reconnectCompleted(): void;
}

export interface ProductFlowEventSink {
  routeChanged(route: ProductRoute): void;
  replyCancelled(input: {
    resumeToken: ResumeToken;
    sourceItemId: string;
  }): void;
  replyCompleted(input: {
    resumeToken: ResumeToken;
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
    bootCompleted({ currentItemId, productRoute }) {
      dispatch({
        type: 'BOOT_COMPLETED',
        currentNotificationItemId: currentItemId,
        productRoute,
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
    replyCancelled({ resumeToken }) {
      dispatch({ type: 'REPLY_CANCELLED', resumeToken });
    },
    replyCompleted({ resumeToken, sourceItemId }) {
      dispatch({ type: 'REPLY_COMPLETED', resumeToken, sourceItemId });
    },
    flowReleased(route) {
      dispatch({ type: 'PRODUCT_FLOW_RELEASED', route });
    },
  };
}
