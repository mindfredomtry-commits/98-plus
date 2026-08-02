/**
 * Coordinator ↔ subsystem ports — Stage 8 Phase 2.
 */
import type {
  AppCoordinatorEvent,
  EntryIntent,
} from './app-coordinator.types';
import type { ProductRoute } from '@/product-flow/create-ban/create-ban.types';
import type { CreateBanDomainPort } from './domain-ports';

export type { CreateBanDomainPort, ApplicationDomainPorts } from './domain-ports';

export type NotificationEntryIntent = Extract<
  EntryIntent,
  { type: 'NOTIFICATION' }
>;

/** Coordinator → Runtime commands. No activation / ownership. */
export interface NotificationRuntimePort {
  ingestEntry(intent: NotificationEntryIntent): void;
  flushDeferredDirectEntry(): void;
}

/**
 * Legacy openRoute port for CreateBan domain-local tests.
 * Coordinator command executor no longer uses this.
 */
export interface ProductFlowPort {
  openRoute(input: { route: ProductRoute }): void;
}

export interface NotificationRuntimeEventSink {
  bootCompleted(): void;
  reconnectStarted(): void;
  reconnectCompleted(): void;
}

/**
 * Product → Coordinator facts.
 * Reply cancel/complete remain no-ops until Reply owner exists.
 * routeChanged is ignored for ownership (routes are domain-local).
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
    bootCompleted() {
      dispatch({ type: 'BOOT_COMPLETED' });
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
    routeChanged() {
      // Domain-local route; Coordinator ownership is unaffected.
    },
    replyCancelled() {
      // Reply owner not in Coordinator yet.
    },
    replyCompleted() {
      // Reply owner not in Coordinator yet.
    },
    flowReleased() {
      dispatch({ type: 'DOMAIN_RELEASED' });
    },
  };
}
