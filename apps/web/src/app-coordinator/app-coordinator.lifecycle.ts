/**
 * One App Coordinator lifecycle for the application.
 * Stage 8 Phase 1 — owner policy + domain intent routing.
 */
import { createAppCoordinatorCommandExecutor } from './app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  createProductFlowEventSink,
} from './app-coordinator.ports';
import {
  createAppCoordinatorStore,
  type AppCoordinatorStore,
} from './app-coordinator.store';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorEvent,
} from './app-coordinator.types';
import type { DomainId } from './application-owner';
import type { ApplicationDomainPorts } from './domain-ports';
import {
  createNotificationRuntimePort,
  type NotificationRuntimePortHandle,
} from './notification-runtime-port';
import { createDirectItemTransport } from '@/notification-runtime/notification-runtime.direct-item-transport';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import {
  createProductFlowController,
  type ProductFlowController,
} from '@/product-flow/product-flow.controller';
import {
  createHttpCreateBanRecipientsPort,
  createHttpCreateBanSubmissionPort,
} from '@/product-flow/create-ban/create-ban.adapters';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import { createTelegramEntryRouter } from './app-coordinator.entry-router';
import {
  entryIntentToCoordinatorEvent,
  type EntryRouter,
} from './app-coordinator.boundaries';

export type AppCoordinatorLifecycle = {
  store: AppCoordinatorStore;
  runtimePort: NotificationRuntimePortHandle;
  productController: ProductFlowController;
  domainPorts: ApplicationDomainPorts;
  entryRouter: EntryRouter;
  dispatch(event: AppCoordinatorEvent): void;
  /**
   * Route a typed domain intent to the Current Owner port only.
   * Coordinator does not inspect intent contents.
   */
  dispatchDomainIntent(domain: DomainId, intent: CreateBanUiIntent): void;
  dispose(): void;
};

export function createAppCoordinatorLifecycle(input: {
  runtimeStore: NotificationRuntimeStore;
  getToken: () => string | null;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
  onInvariantViolation?: (
    violation: AppCoordinatorInvariantViolation,
    event: AppCoordinatorEvent | { type: 'DOMAIN_INTENT' },
  ) => void;
}): AppCoordinatorLifecycle {
  let disposed = false;
  const entryRouter = createTelegramEntryRouter();

  let store!: AppCoordinatorStore;
  let runtimePort!: NotificationRuntimePortHandle;
  let productController!: ProductFlowController;
  let domainPorts!: ApplicationDomainPorts;

  const dispatch = (event: AppCoordinatorEvent) => {
    if (disposed) return;
    store.dispatch(event);
  };

  const runtimeSink = createNotificationRuntimeEventSink(dispatch);
  const productSink = createProductFlowEventSink(dispatch);

  const submissionPort = createHttpCreateBanSubmissionPort({
    getToken: input.getToken,
    onboard: input.onboard,
    refreshUser: input.refreshUser,
  });
  const recipientsPort = createHttpCreateBanRecipientsPort({
    getToken: input.getToken,
  });

  productController = createProductFlowController({
    sink: productSink,
    submissionPort,
    recipientsPort,
  });

  domainPorts = {
    CREATE_BAN: productController.asDomainPort(),
  };

  runtimePort = createNotificationRuntimePort({
    store: input.runtimeStore,
    sink: runtimeSink,
    fetchDirectItem: createDirectItemTransport(input.getToken),
  });

  const executor = createAppCoordinatorCommandExecutor({
    notificationRuntime: runtimePort,
  });

  store = createAppCoordinatorStore({
    initialState: createInitialAppCoordinatorState(),
    executor,
    reduceContext: {
      getCurrentCapability() {
        const owner = store.getState().currentOwner;
        if (owner.type !== 'DOMAIN') return null;
        if (owner.domain === 'CREATE_BAN') {
          return domainPorts.CREATE_BAN.getCapability();
        }
        return null;
      },
    },
    onInvariantViolation(violation, event) {
      input.onInvariantViolation?.(violation, event);
      console.error('[app-coordinator:invariant]', violation, event);
    },
  });

  store.dispatch({ type: 'APP_STARTED' });

  return {
    store,
    runtimePort,
    productController,
    domainPorts,
    entryRouter,
    dispatch,
    dispatchDomainIntent(domain, intent) {
      if (disposed) return;
      const owner = store.getState().currentOwner;
      if (owner.type !== 'DOMAIN' || owner.domain !== domain) {
        const violation: AppCoordinatorInvariantViolation = {
          code: 'DOMAIN_INTENT_NOT_CURRENT_OWNER',
          eventType: 'DOMAIN_INTENT',
          message: `Domain intent rejected: ${domain} is not current owner`,
        };
        input.onInvariantViolation?.(violation, { type: 'DOMAIN_INTENT' });
        console.error('[app-coordinator:invariant]', violation);
        return;
      }
      // One recipient. Payload opaque to Coordinator beyond typed port boundary.
      if (domain === 'CREATE_BAN') {
        domainPorts.CREATE_BAN.dispatch(intent);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runtimePort.dispose();
      productController.dispose();
    },
  };
}

export function routeLaunchEntry(
  lifecycle: AppCoordinatorLifecycle,
  input: {
    startParam: string | null;
    launchSource: 'telegram' | 'bot-button' | 'web' | 'unknown';
  },
): void {
  const intent = lifecycle.entryRouter.route(input);
  lifecycle.dispatch(entryIntentToCoordinatorEvent(intent));
}
