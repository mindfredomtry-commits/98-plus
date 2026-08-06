/**
 * One App Coordinator lifecycle for the application.
 * Stage 8 Phase 5/9H — CREATE_BAN + SETTINGS + NOTIFICATIONS domain ports.
 *
 * Phase 9H: openNotifications() activates Runtime BEFORE committing
 * NOTIFICATIONS owner. Close release is SESSION_COMPLETE → sink only,
 * stale session generations ignored.
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
import type {
  NotificationsOpenResult,
  NotificationsSessionCompleteMeta,
} from '@/notifications/notifications.open-types';
import {
  logNotificationsChaos,
  nextChaosLifecycleId,
} from '@/notification-runtime/notification-chaos-diag';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';
import { presentNotificationsState } from '@/notifications/presentation/notifications.presenter';
import { available } from '@/domain-availability';
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
  notificationsController: NotificationsController;
  domainPorts: ApplicationDomainPorts;
  entryRouter: EntryRouter;
  chaosLifecycleId: string;
  /** Phase 9H — sole production Lobby → Notifications open transaction. */
  openNotifications(correlationId?: string): NotificationsOpenResult;
  getOwnerTransitionGeneration(): number;
  dispatch(event: AppCoordinatorEvent): void;
  dispatchDomainIntent(input: DomainIntent): void;
  dispose(): void;
};

function ownerLabel(owner: { type: string; domain?: string }): string {
  return owner.type === 'DOMAIN' ? String(owner.domain) : owner.type;
}

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
  let notificationsOpenCount = 0;
  let releaseDispatchCount = 0;
  let ownerTransitionGeneration = 0;
  /** Session generation committed with the current NOTIFICATIONS ownership. */
  let committedPresentationSessionGeneration = 0;
  /** When true, OPEN_NOTIFICATIONS_REQUESTED must not re-activate. */
  let openPreActivated = false;

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

  const runtimeSnap = () => {
    const rt = input.runtimeStore.getState();
    return {
      syncStatus: rt.syncStatus,
      revision: rt.revision,
      activeItemId: rt.activeItemId,
      passiveItemIds: [...rt.passiveItemIds],
    };
  };

  const generationSnap = () => ({
    ownerTransitionGeneration,
    presentationSessionGeneration:
      notificationsController?.getPresentationSessionGeneration() ?? 0,
    activationGeneration:
      notificationsController?.getActivationGeneration() ?? 0,
    committedPresentationSessionGeneration,
  });

  const dispatch = (event: AppCoordinatorEvent) => {
    if (disposed) return;
    const ownerBefore = store.getState().currentOwner;
    const isSecondOpen =
      event.type === 'OPEN_NOTIFICATIONS_REQUESTED' &&
      notificationsOpenCount >= 1;
    const openDiagId = isSecondOpen
      ? nextNotificationsSyncCorrelationId('open2')
      : nextNotificationsSyncCorrelationId('open');
    const releaseDiagId = nextNotificationsSyncCorrelationId('release');

    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
      releaseDispatchCount += 1;
      logNotificationsSyncDiag(releaseDiagId, 'RELEASE_EVENT_DISPATCHED', {
        releaseDispatchCount,
        releaseProducer: 'SESSION_COMPLETE_SINK',
        ownerBefore: ownerLabel(ownerBefore),
        ...runtimeSnap(),
        ...generationSnap(),
      });
      logNotificationsSyncDiag(releaseDiagId, 'COORDINATOR_RELEASE', {
        releaseDispatchCount,
        ownerBefore: ownerLabel(ownerBefore),
        ...generationSnap(),
      });
    }

    if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED' && isSecondOpen) {
      logNotificationsSyncDiag(openDiagId, 'SECOND_OPEN_EVENT_DISPATCHED', {
        openCount: notificationsOpenCount + 1,
        ownerBefore: ownerLabel(ownerBefore),
        ...runtimeSnap(),
        ...generationSnap(),
      });
    } else if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED') {
      logNotificationsSyncDiag(openDiagId, 'OPEN_INTENT', {
        openCount: notificationsOpenCount + 1,
        ownerBefore: ownerLabel(ownerBefore),
        ...runtimeSnap(),
        ...generationSnap(),
      });
    }

    const dispatchResult = store.dispatch(event);
    const ownerAfter = store.getState().currentOwner;
    const coordState = store.getState();

    if (
      event.type === 'NOTIFICATIONS_RELEASE_REQUESTED' ||
      event.type === 'OPEN_NOTIFICATIONS_REQUESTED'
    ) {
      logNotificationsChaos('coordinator', event.type, {
        lifecycleId: chaosLifecycleId,
        storeId: input.runtimeStore.chaosStoreId,
        currentOwner: ownerLabel(ownerAfter),
        returnOwner: (() => {
          const r = coordState.returnOwner;
          if (!r) return null;
          return ownerLabel(r);
        })(),
        reason: event.type,
        detail: {
          ownerBefore: ownerLabel(ownerBefore),
          dispatchStatus: dispatchResult.status,
        },
      });
    }

    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
      logNotificationsSyncDiag(releaseDiagId, 'RELEASE_EVENT_RESULT', {
        releaseDispatchCount,
        dispatchStatus: dispatchResult.status,
        ownerBefore: ownerLabel(ownerBefore),
        ownerAfter: ownerLabel(ownerAfter),
        violation:
          dispatchResult.status === 'PROCESSED'
            ? dispatchResult.result.violation
            : null,
        ...runtimeSnap(),
        ...generationSnap(),
      });
      logNotificationsSyncDiag(releaseDiagId, 'OWNER_AFTER_RELEASE', {
        currentOwner: ownerLabel(ownerAfter),
        returnOwner: coordState.returnOwner
          ? ownerLabel(coordState.returnOwner)
          : null,
        releaseDispatchCount,
      });
      logNotificationsSyncDiag(
        releaseDiagId,
        'COORDINATOR_OWNER_COMMIT_CREATE_BAN',
        {
          currentOwner: ownerLabel(ownerAfter),
          ...runtimeSnap(),
          ...generationSnap(),
        },
      );
      logNotificationsSyncDiag(releaseDiagId, 'AVAILABILITY_AFTER_RELEASE', {
        availability: domainPorts.NOTIFICATIONS.getAvailability(),
        ...runtimeSnap(),
      });
      if (
        ownerAfter.type === 'DOMAIN' &&
        ownerAfter.domain === 'CREATE_BAN'
      ) {
        committedPresentationSessionGeneration = 0;
      }
    }

    if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED' && isSecondOpen) {
      logNotificationsSyncDiag(openDiagId, 'SECOND_OPEN_EVENT_RESULT', {
        dispatchStatus: dispatchResult.status,
        violation:
          dispatchResult.status === 'PROCESSED'
            ? dispatchResult.result.violation
            : null,
        ownerBefore: ownerLabel(ownerBefore),
        ownerAfter: ownerLabel(ownerAfter),
        ...runtimeSnap(),
        ...generationSnap(),
      });
      logNotificationsSyncDiag(openDiagId, 'OWNER_AFTER_SECOND_OPEN', {
        currentOwner: ownerLabel(ownerAfter),
        returnOwner: coordState.returnOwner
          ? ownerLabel(coordState.returnOwner)
          : null,
        ...runtimeSnap(),
      });
    }
  };

  function activateAfterOpen(ownerBefore: {
    type: string;
    domain?: string;
  }): void {
    // Fallback for legacy dispatch(OPEN) without openNotifications().
    if (input.runtimeStore.getState().activeItemId != null) {
      notificationsOpenCount += 1;
      return;
    }
    notificationsOpenCount += 1;
    const isSecondOpen = notificationsOpenCount >= 2;
    const openDiagId = nextNotificationsSyncCorrelationId(
      isSecondOpen ? 'open2' : 'open',
    );
    const rtBefore = runtimeSnap();
    logNotificationsSyncDiag(
      openDiagId,
      isSecondOpen ? 'SECOND_OPEN_EVENT_DISPATCHED' : 'OPEN_INTENT',
      {
        phase: 'activateAfterOpen',
        syncStatus: rtBefore.syncStatus,
        revision: rtBefore.revision,
        passiveItemIds: rtBefore.passiveItemIds,
        activeItemId: rtBefore.activeItemId,
        openCount: notificationsOpenCount,
        ownerBefore: ownerLabel(ownerBefore),
      },
    );
    const owner = store.getState().currentOwner;
    logNotificationsSyncDiag(openDiagId, 'OWNER_DECISION', {
      owner: ownerLabel(owner),
      availability: domainPorts.NOTIFICATIONS.getAvailability(),
    });
    if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
      const sessionGen = notificationsController.beginPresentationSession();
      committedPresentationSessionGeneration = sessionGen;
      domainPorts.NOTIFICATIONS.dispatch({
        type: 'ACTIVATE_READY_ITEM_REQUESTED',
      });
      const domainState = notificationsController.getState();
      const outcome = domainState.lastActivationOutcome;
      const rtAfter = runtimeSnap();
      logNotificationsSyncDiag(openDiagId, 'ACTIVATION_RESULT', {
        outcome,
        activeItemId: rtAfter.activeItemId,
        passiveItemIds: rtAfter.passiveItemIds,
        isSecondOpen,
      });
      const view = presentNotificationsState(domainState);
      logNotificationsSyncDiag(openDiagId, 'PRESENTER_VIEW_AFTER_ACTIVATION', {
        viewPhase: view.phase,
        viewItemId: view.phase === 'ITEM' ? view.itemId : null,
        activationGeneration: domainState.activationGeneration,
        activeItemId: rtAfter.activeItemId,
      });
      if (
        outcome?.type === 'NO_READY_ITEM' ||
        outcome?.type === 'SYNC_NOT_READY'
      ) {
        logNotificationsChaos('coordinator', 'NOTIFICATIONS_RELEASE_REQUESTED', {
          lifecycleId: chaosLifecycleId,
          reason:
            outcome.type === 'NO_READY_ITEM'
              ? 'NO_READY_ITEM_AFTER_OPEN'
              : 'SYNC_NOT_READY_AFTER_OPEN',
          currentOwner: 'NOTIFICATIONS',
        });
        logNotificationsSyncDiag(openDiagId, 'RELEASE', {
          reason:
            outcome.type === 'NO_READY_ITEM'
              ? 'NO_READY_ITEM_AFTER_OPEN'
              : 'SYNC_NOT_READY_AFTER_OPEN',
        });
        dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
      }
    }
  }

  function openNotifications(
    correlationIdInput?: string,
  ): NotificationsOpenResult {
    const correlationId =
      correlationIdInput ?? nextNotificationsSyncCorrelationId('open');
    if (disposed) {
      return {
        ok: false,
        correlationId,
        code: 'DISPOSED',
        message: 'Lifecycle disposed',
      };
    }

    const ownerBefore = store.getState().currentOwner;
    logNotificationsSyncDiag(correlationId, 'COORDINATOR_OPEN_BEGIN', {
      source: 'openNotifications',
      currentOwner: ownerLabel(ownerBefore),
      returnOwner: store.getState().returnOwner
        ? ownerLabel(store.getState().returnOwner!)
        : null,
      ...runtimeSnap(),
      ...generationSnap(),
    });

    if (
      ownerBefore.type !== 'DOMAIN' ||
      ownerBefore.domain !== 'CREATE_BAN'
    ) {
      return {
        ok: false,
        correlationId,
        code: 'OWNER_NOT_ALLOWED',
        message: `Cannot open Notifications from owner ${ownerLabel(ownerBefore)}`,
      };
    }

    const capability = domainPorts.NOTIFICATIONS.getAvailability();
    logNotificationsSyncDiag(correlationId, 'COORDINATOR_CAPABILITY', {
      capability,
      ...runtimeSnap(),
      ...generationSnap(),
    });
    if (capability.availability !== 'AVAILABLE') {
      return {
        ok: false,
        correlationId,
        code: 'NOTIFICATIONS_UNAVAILABLE',
        message: `Notifications unavailable: ${capability.reason ?? 'unknown'}`,
      };
    }

    ownerTransitionGeneration += 1;
    const sessionGen = notificationsController.beginPresentationSession();
    logNotificationsSyncDiag(correlationId, 'RUNTIME_SESSION_BEGIN', {
      presentationSessionGeneration: sessionGen,
      ownerTransitionGeneration,
      ...runtimeSnap(),
    });

    const activate = notificationsController.activateNext(correlationId);
    const domainState = notificationsController.getState();
    const view = presentNotificationsState(domainState);
    logNotificationsSyncDiag(correlationId, 'PRESENTER_SNAPSHOT', {
      viewPhase: view.phase,
      viewItemId: view.phase === 'ITEM' ? view.itemId : null,
      activationGeneration: activate.activationGeneration,
      presentationSessionGeneration: sessionGen,
      activeItemId: activate.activeItemId,
    });

    const activated =
      (activate.outcome.type === 'ACTIVATED' ||
        activate.outcome.type === 'ALREADY_ACTIVE') &&
      activate.activeItemId != null &&
      view.phase === 'ITEM';

    if (!activated) {
      // Do not commit owner. Clear any accidental claim.
      if (input.runtimeStore.getState().activeItemId != null) {
        notificationsController.dispatch({
          type: 'CLEAR_ACTIVATION_REQUESTED',
        });
      }
      return {
        ok: false,
        correlationId,
        code: 'ACTIVATION_FAILED',
        message: `Activation failed: ${activate.outcome.type}`,
      };
    }

    // Activate succeeded — commit owner. Skip re-activation in onEventProcessed.
    openPreActivated = true;
    committedPresentationSessionGeneration = sessionGen;
    notificationsOpenCount += 1;
    dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    openPreActivated = false;

    const ownerAfter = store.getState().currentOwner;
    logNotificationsSyncDiag(correlationId, 'COORDINATOR_OWNER_COMMIT', {
      currentOwner: ownerLabel(ownerAfter),
      returnOwner: store.getState().returnOwner
        ? ownerLabel(store.getState().returnOwner!)
        : null,
      activeItemId: activate.activeItemId,
      ...generationSnap(),
    });

    if (
      ownerAfter.type !== 'DOMAIN' ||
      ownerAfter.domain !== 'NOTIFICATIONS'
    ) {
      notificationsController.dispatch({ type: 'CLEAR_ACTIVATION_REQUESTED' });
      committedPresentationSessionGeneration = 0;
      return {
        ok: false,
        correlationId,
        code: 'OWNER_NOT_ALLOWED',
        message: 'Owner commit did not yield NOTIFICATIONS',
      };
    }

    return {
      ok: true,
      correlationId,
      ownerTransitionGeneration,
      presentationSessionGeneration: sessionGen,
      activationGeneration: activate.activationGeneration,
      activeItemId: activate.activeItemId!,
    };
  }

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
    getUserId: () => null,
    onRefresh: async (reason) => {
      const transport = (
        globalThis as unknown as {
          __directNotificationTransport?: {
            refresh: (r: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
          };
        }
      ).__directNotificationTransport;
      await transport?.refresh(reason);
    },
    sink: {
      sessionCompleted(meta: NotificationsSessionCompleteMeta) {
        if (disposed) return;
        const owner = store.getState().currentOwner;
        const rt = runtimeSnap();
        logNotificationsSyncDiag(
          nextNotificationsSyncCorrelationId('close'),
          'SESSION_COMPLETE_SINK',
          {
            currentOwner: ownerLabel(owner),
            releaseDispatchCountBefore: releaseDispatchCount,
            eventSessionGeneration: meta.presentationSessionGeneration,
            committedPresentationSessionGeneration,
            reason: meta.reason,
            ...rt,
            ...generationSnap(),
            producer: 'SESSION_COMPLETE_ONLY',
          },
        );

        if (
          committedPresentationSessionGeneration > 0 &&
          meta.presentationSessionGeneration <
            committedPresentationSessionGeneration
        ) {
          logNotificationsSyncDiag(
            nextNotificationsSyncCorrelationId('close'),
            'STALE_SESSION_COMPLETE_IGNORED',
            {
              eventSessionGeneration: meta.presentationSessionGeneration,
              committedPresentationSessionGeneration,
              currentOwner: ownerLabel(owner),
              ...rt,
            },
          );
          return;
        }

        if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
          logNotificationsChaos('controller', 'sessionCompleted', {
            lifecycleId: chaosLifecycleId,
            storeId: input.runtimeStore.chaosStoreId,
            reason: 'SESSION_COMPLETE_EFFECT',
            currentOwner: 'NOTIFICATIONS',
            activeItemId: rt.activeItemId,
            queueAfter: rt.passiveItemIds,
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
    onEventProcessed(event, result, previousState) {
      if (disposed) return;
      if (event.type !== 'OPEN_NOTIFICATIONS_REQUESTED') return;
      if (result.violation) return;
      const owner = store.getState().currentOwner;
      if (owner.type !== 'DOMAIN' || owner.domain !== 'NOTIFICATIONS') return;
      if (openPreActivated) {
        // openNotifications already activated before owner commit.
        return;
      }
      activateAfterOpen(
        previousState.currentOwner.type === 'DOMAIN'
          ? {
              type: 'DOMAIN',
              domain: previousState.currentOwner.domain,
            }
          : { type: previousState.currentOwner.type },
      );
    },
  });

  store.dispatch({ type: 'APP_STARTED' });

  const lifecycleApi: AppCoordinatorLifecycle = {
    store,
    runtimePort,
    productController,
    settingsController,
    notificationsController,
    domainPorts,
    entryRouter,
    chaosLifecycleId,
    openNotifications,
    getOwnerTransitionGeneration() {
      return ownerTransitionGeneration;
    },
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

  // Test-only: inject delayed SESSION_COMPLETE from an older generation.
  (
    lifecycleApi as AppCoordinatorLifecycle & {
      __testInjectSessionComplete: (
        meta: NotificationsSessionCompleteMeta,
      ) => void;
    }
  ).__testInjectSessionComplete = (meta) => {
    if (disposed) return;
    const owner = store.getState().currentOwner;
    const rt = runtimeSnap();
    if (
      committedPresentationSessionGeneration > 0 &&
      meta.presentationSessionGeneration <
        committedPresentationSessionGeneration
    ) {
      logNotificationsSyncDiag(
        nextNotificationsSyncCorrelationId('close'),
        'STALE_SESSION_COMPLETE_IGNORED',
        {
          eventSessionGeneration: meta.presentationSessionGeneration,
          committedPresentationSessionGeneration,
          currentOwner: ownerLabel(owner),
          ...rt,
        },
      );
      return;
    }
    if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
      dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
    }
  };

  return lifecycleApi;
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
