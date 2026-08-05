/**
 * Stage 8 Phase 8 — Notifications domain controller / port.
 * Session completion only from Runtime SESSION_COMPLETE effect (Close release).
 */
import type { DomainAvailability } from '@/domain-availability';
import type { DomainCapability } from '@/domain-capability';
import { createNotificationIntents } from '@/notification-runtime/notification-runtime.intents';
import { runNotificationRuntimeEffects } from '@/notification-runtime/notification-runtime.effects';
import {
  selectActiveItem,
  selectActiveItemId,
} from '@/notification-runtime/notification-runtime.selectors';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import { mapNotificationsAvailability } from './notifications.availability';
import { mapNotificationsCapability } from './notifications.capability';
import { selectNotificationsDomainState } from './notifications.selectors';
import type {
  NotificationsActivationOutcome,
  NotificationsDomainState,
  NotificationsIntent,
} from './notifications.types';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';

export type NotificationsListener = (state: NotificationsDomainState) => void;

export type NotificationsDomainSink = {
  sessionCompleted(): void;
};

export type NotificationsController = {
  getState(): NotificationsDomainState;
  subscribe(listener: NotificationsListener): () => void;
  dispatch(intent: NotificationsIntent): void;
  getCapability(): DomainCapability;
  getAvailability(): DomainAvailability;
  asDomainPort(): {
    dispatch(intent: NotificationsIntent): void;
    getCapability(): DomainCapability;
    getAvailability(): DomainAvailability;
  };
  dispose(): void;
};

export function createNotificationsController(input: {
  store: NotificationRuntimeStore;
  getToken: () => string | null;
  getUserId?: () => string | null;
  onRefresh?: (reason: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
  sink?: NotificationsDomainSink;
}): NotificationsController {
  let disposed = false;
  let lastActivationOutcome: NotificationsActivationOutcome | null = null;
  let activationGeneration = 0;
  const listeners = new Set<NotificationsListener>();

  const intents = createNotificationIntents({
    store: input.store,
    getToken: input.getToken,
    getUserId: input.getUserId,
    onRefresh: input.onRefresh,
  });

  async function drainEffects(): Promise<void> {
    await runNotificationRuntimeEffects(
      input.store,
      input.store.getLastEffects(),
      {
        getToken: input.getToken,
        getUserId: input.getUserId,
        onRefreshPending: async () => {
          await input.onRefresh?.('user');
        },
        onRequestFullSync: () => {
          void input.onRefresh?.('user');
        },
        onSessionComplete: () => {
          input.sink?.sessionCompleted();
        },
      },
    );
  }

  function project(): NotificationsDomainState {
    return selectNotificationsDomainState(
      input.store.getState(),
      lastActivationOutcome,
      activationGeneration,
    );
  }

  let cachedState: NotificationsDomainState = project();

  function emit(): void {
    cachedState = project();
    for (const listener of [...listeners]) {
      listener(cachedState);
    }
  }

  const unsubscribeStore = input.store.subscribe(() => {
    if (disposed) return;
    emit();
  });

  const controller: NotificationsController = {
    getState() {
      return cachedState;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispatch(intent) {
      if (disposed) return;

      switch (intent.type) {
        case 'ACTIVATE_READY_ITEM_REQUESTED': {
          const diagId = nextNotificationsSyncCorrelationId('activate');
          const rtBefore = input.store.getState();
          logNotificationsSyncDiag(diagId, 'ACTIVATE_EVENT_DISPATCHED', {
            syncStatus: rtBefore.syncStatus,
            revision: rtBefore.revision,
            activeItemId: rtBefore.activeItemId,
            passiveItemIds: [...rtBefore.passiveItemIds],
            activationGeneration,
          });
          const result = input.store.dispatch({
            type: 'ACTIVATE_READY_ITEM_REQUESTED',
            source: 'user',
          });
          lastActivationOutcome =
            result.activationOutcome ?? { type: 'NO_READY_ITEM' };
          if (
            lastActivationOutcome.type === 'ACTIVATED' ||
            lastActivationOutcome.type === 'ALREADY_ACTIVE'
          ) {
            activationGeneration += 1;
          }
          const rtAfter = input.store.getState();
          logNotificationsSyncDiag(diagId, 'ACTIVATE_EVENT_RESULT', {
            outcome: lastActivationOutcome,
            activeItemId: rtAfter.activeItemId,
            passiveItemIds: [...rtAfter.passiveItemIds],
            activationGeneration,
          });
          void drainEffects();
          emit();
          logNotificationsSyncDiag(diagId, 'RUNTIME_AFTER_ACTIVATION', {
            syncStatus: rtAfter.syncStatus,
            revision: rtAfter.revision,
            activeItemId: rtAfter.activeItemId,
            passiveItemIds: [...rtAfter.passiveItemIds],
          });
          logNotificationsSyncDiag(
            diagId,
            'CONTROLLER_SNAPSHOT_AFTER_ACTIVATION',
            {
              activation: cachedState.activation,
              activeItemId: cachedState.activeItem?.itemId ?? null,
              activationGeneration: cachedState.activationGeneration,
              lastActivationOutcome: cachedState.lastActivationOutcome,
            },
          );
          return;
        }

        case 'CLEAR_ACTIVATION_REQUESTED': {
          input.store.dispatch({
            type: 'CLEAR_ACTIVATION_REQUESTED',
            source: 'user',
          });
          emit();
          return;
        }

        case 'ACTIVE_ITEM_CLOSE_REQUESTED': {
          const closeDiagId = nextNotificationsSyncCorrelationId('close');
          const before = input.store.getState();
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_INTENT', {
            activeItemId: before.activeItemId,
            passiveItemIds: [...before.passiveItemIds],
            syncStatus: before.syncStatus,
            revision: before.revision,
            activationGeneration,
          });
          const closeResult = input.store.dispatch({
            type: 'ACTIVE_ITEM_CLOSE_REQUESTED',
            source: 'user',
          });
          const after = input.store.getState();
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_RUNTIME_DISPATCH_RESULT', {
            activeItemId: after.activeItemId,
            passiveItemIds: [...after.passiveItemIds],
            syncStatus: after.syncStatus,
            revision: after.revision,
            effects: closeResult.effects.map((e) => e.type),
            presentationRetained: before.activeItemId
              ? Boolean(after.presentationByItemId[before.activeItemId])
              : true,
          });
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_EFFECTS', {
            effects: closeResult.effects.map((e) =>
              e.type === 'SESSION_COMPLETE'
                ? { type: e.type, reason: e.reason }
                : { type: e.type },
            ),
          });
          // Drain SESSION_COMPLETE synchronously so release cannot race OPEN.
          // Pass exact effects from this dispatch (not mutable getLastEffects).
          void runNotificationRuntimeEffects(
            input.store,
            closeResult.effects,
            {
              getToken: input.getToken,
              getUserId: input.getUserId,
              onRefreshPending: async () => {
                await input.onRefresh?.('user');
              },
              onRequestFullSync: () => {
                void input.onRefresh?.('user');
              },
              onSessionComplete: () => {
                input.sink?.sessionCompleted();
              },
            },
          );
          emit();
          return;
        }

        case 'ITEM_ACTION_REQUESTED': {
          const active = selectActiveItem(input.store.getState());
          if (!active) return;
          const action = intent.action;
          void (async () => {
            if (action.type === 'ACCEPT') {
              if (active.kind !== 'incoming') return;
              await intents.accept();
              return;
            }
            if (action.type === 'CONFIRM_CHECK') {
              if (active.kind !== 'check') return;
              await intents.confirmCheck(action.completed);
              return;
            }
            if (action.type === 'DISMISS_RESULT') {
              if (active.kind !== 'result') return;
              await intents.dismissResult('close_result');
              return;
            }
            await intents.dismissCurrent('user_dismiss');
          })();
          return;
        }

        case 'RETRY_REQUESTED': {
          const active = selectActiveItem(input.store.getState());
          const runtime = input.store.getState();
          if (!active || runtime.action.status !== 'FAILED') return;
          if (active.kind === 'incoming') {
            void intents.accept();
            return;
          }
          if (active.kind === 'check') {
            void intents.confirmCheck(true);
            return;
          }
          return;
        }

        default: {
          const _exhaustive: never = intent;
          void _exhaustive;
        }
      }
    },

    getCapability() {
      return mapNotificationsCapability(input.store.getState());
    },

    getAvailability() {
      return mapNotificationsAvailability(input.store.getState());
    },

    asDomainPort() {
      return {
        dispatch(intent) {
          controller.dispatch(intent);
        },
        getCapability() {
          return controller.getCapability();
        },
        getAvailability() {
          return controller.getAvailability();
        },
      };
    },

    dispose() {
      disposed = true;
      unsubscribeStore();
      listeners.clear();
    },
  };

  void selectActiveItemId;
  return controller;
}
