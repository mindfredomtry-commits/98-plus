/**
 * One App Coordinator lifecycle for the application.
 * Stage 8 Phase 5 — CREATE_BAN + SETTINGS + NOTIFICATIONS domain ports.
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
import {
  createNotificationsController,
  type NotificationsController,
} from '@/notifications/notifications.controller';
import { createTelegramEntryRouter } from './app-coordinator.entry-router';
import {
  entryIntentToCoordinatorEvent,
  type EntryRouter,
} from './app-coordinator.boundaries';
import { available } from '@/domain-availability';

export type AppCoordinatorLifecycle = {
  store: AppCoordinatorStore;
  runtimePort: NotificationRuntimePortHandle;
  productController: ProductFlowController;
  settingsController: SettingsController;
  notificationsController: NotificationsController;
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
  let notificationsController!: NotificationsController;
  let domainPorts!: ApplicationDomainPorts;

  const dispatch = (event: AppCoordinatorEvent) => {
    if (disposed) return;
    store.dispatch(event);

    // After successful open: activate ready item. Prefer availability gate (A);
    // if activation still fails, release immediately (no empty trap).
    if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED') {
      const owner = store.getState().currentOwner;
      if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
        domainPorts.NOTIFICATIONS.dispatch({
          type: 'ACTIVATE_READY_ITEM_REQUESTED',
        });
        const domainState = notificationsController.getState();
        // Require a presentable active item — stale ACTIVE claims must not trap
        // the owner, and failed activation must not leave an empty surface.
        if (
          domainState.activation.type === 'INACTIVE' ||
          domainState.activeItem == null
        ) {
          domainPorts.NOTIFICATIONS.dispatch({
            type: 'CLEAR_ACTIVATION_REQUESTED',
          });
          store.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
        }
      }
    }
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
  notificationsController = createNotificationsController({
    store: input.runtimeStore,
    getToken: input.getToken,
    sink: {
      sessionCompleted() {
        if (disposed) return;
        const owner = store.getState().currentOwner;
        if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
          dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
        }
      },
    },
  });

  domainPorts = {
    CREATE_BAN: productController.asDomainPort(),
    SETTINGS: settingsController.asDomainPort(),
    NOTIFICATIONS: notificationsController.asDomainPort(),
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
        if (owner.domain === 'NOTIFICATIONS') {
          return domainPorts.NOTIFICATIONS.getCapability();
        }
        return null;
      },
      getTargetAvailability(domain) {
        if (domain === 'NOTIFICATIONS') {
          return domainPorts.NOTIFICATIONS.getAvailability();
        }
        return available();
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
    notificationsController,
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
      if (inputIntent.domain === 'SETTINGS') {
        domainPorts.SETTINGS.dispatch(inputIntent.intent);
        return;
      }
      domainPorts.NOTIFICATIONS.dispatch(inputIntent.intent);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runtimePort.dispose();
      productController.dispose();
      settingsController.dispose();
      notificationsController.dispose();
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
