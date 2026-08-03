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
import {
  logNotificationsChaos,
  nextChaosLifecycleId,
} from '@/notification-runtime/notification-chaos-diag';

export type AppCoordinatorLifecycle = {
  store: AppCoordinatorStore;
  runtimePort: NotificationRuntimePortHandle;
  productController: ProductFlowController;
  settingsController: SettingsController;
  notificationsController: NotificationsController;
  domainPorts: ApplicationDomainPorts;
  entryRouter: EntryRouter;
  /** Stable identity for chaos diagnostics. */
  chaosLifecycleId: string;
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
  const chaosLifecycleId = nextChaosLifecycleId();
  logNotificationsChaos('lifecycle', 'CREATED', {
    lifecycleId: chaosLifecycleId,
    storeId: input.runtimeStore.chaosStoreId,
  });

  let store!: AppCoordinatorStore;
  let runtimePort!: NotificationRuntimePortHandle;
  let productController!: ProductFlowController;
  let settingsController!: SettingsController;
  let notificationsController!: NotificationsController;
  let domainPorts!: ApplicationDomainPorts;

  const dispatch = (event: AppCoordinatorEvent) => {
    if (disposed) return;
    const ownerBefore = store.getState().currentOwner;
    store.dispatch(event);
    const ownerAfter = store.getState().currentOwner;
    if (
      event.type === 'NOTIFICATIONS_RELEASE_REQUESTED' ||
      event.type === 'OPEN_NOTIFICATIONS_REQUESTED'
    ) {
      logNotificationsChaos('coordinator', event.type, {
        lifecycleId: chaosLifecycleId,
        storeId: input.runtimeStore.chaosStoreId,
        currentOwner:
          ownerAfter.type === 'DOMAIN' ? ownerAfter.domain : ownerAfter.type,
        returnOwner: (() => {
          const r = store.getState().returnOwner;
          if (!r) return null;
          return r.type === 'DOMAIN' ? r.domain : r.type;
        })(),
        reason: event.type,
        detail: {
          ownerBefore:
            ownerBefore.type === 'DOMAIN'
              ? ownerBefore.domain
              : ownerBefore.type,
        },
      });
    }

    // After successful open: activate ready item as one ordered transaction.
    // Rollback ownership only on typed NO_READY_ITEM — never by observing a
    // temporary empty read model / presenter phase.
    if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED') {
      const owner = store.getState().currentOwner;
      if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
        domainPorts.NOTIFICATIONS.dispatch({
          type: 'ACTIVATE_READY_ITEM_REQUESTED',
        });
        const outcome =
          notificationsController.getState().lastActivationOutcome;
        if (outcome?.type === 'NO_READY_ITEM') {
          logNotificationsChaos('coordinator', 'NOTIFICATIONS_RELEASE_REQUESTED', {
            lifecycleId: chaosLifecycleId,
            reason: 'NO_READY_ITEM_AFTER_OPEN',
            currentOwner: 'NOTIFICATIONS',
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
    getUserId: () => {
      // Token auth user — transport owns userId; optional for adapter.
      return null;
    },
    sink: {
      sessionCompleted() {
        if (disposed) return;
        const owner = store.getState().currentOwner;
        if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
          const rt = input.runtimeStore.getState();
          logNotificationsChaos('controller', 'sessionCompleted', {
            lifecycleId: chaosLifecycleId,
            storeId: input.runtimeStore.chaosStoreId,
            reason: 'SESSION_COMPLETE_EFFECT',
            currentOwner: 'NOTIFICATIONS',
            activeItemId: rt.activeItemId,
            queueAfter: [...rt.passiveItemIds],
          });
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
    chaosLifecycleId,
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
      logNotificationsChaos('lifecycle', 'DISPOSED', {
        lifecycleId: chaosLifecycleId,
        storeId: input.runtimeStore.chaosStoreId,
      });
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
