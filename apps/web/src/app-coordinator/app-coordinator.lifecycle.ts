/**
 * One App Coordinator lifecycle for the application.
 * Stage 8 Phase 4 — CREATE_BAN + SETTINGS domain ports.
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
import type {
  ApplicationDomainPorts,
  DomainIntent,
} from './domain-ports';
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
import {
  createSettingsController,
  type SettingsController,
} from '@/settings/settings.controller';
import { createTelegramEntryRouter } from './app-coordinator.entry-router';
import {
  entryIntentToCoordinatorEvent,
  type EntryRouter,
} from './app-coordinator.boundaries';

export type AppCoordinatorLifecycle = {
  store: AppCoordinatorStore;
  runtimePort: NotificationRuntimePortHandle;
  productController: ProductFlowController;
  settingsController: SettingsController;
  domainPorts: ApplicationDomainPorts;
  entryRouter: EntryRouter;
  dispatch(event: AppCoordinatorEvent): void;
  /**
   * Route a typed domain intent to the Current Owner port only.
   * Coordinator does not inspect intent contents.
   */
  dispatchDomainIntent(input: DomainIntent): void;
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
  let settingsController!: SettingsController;
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
  settingsController = createSettingsController();

  domainPorts = {
    CREATE_BAN: productController.asDomainPort(),
    SETTINGS: settingsController.asDomainPort(),
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
        if (owner.domain === 'SETTINGS') {
          return domainPorts.SETTINGS.getCapability();
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
    settingsController,
    domainPorts,
    entryRouter,
    dispatch,
    dispatchDomainIntent(inputIntent) {
      if (disposed) return;
      const owner = store.getState().currentOwner;
      const domain: DomainId = inputIntent.domain;
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
      if (inputIntent.domain === 'CREATE_BAN') {
        domainPorts.CREATE_BAN.dispatch(inputIntent.intent);
        return;
      }
      domainPorts.SETTINGS.dispatch(inputIntent.intent);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runtimePort.dispose();
      productController.dispose();
      settingsController.dispose();
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
