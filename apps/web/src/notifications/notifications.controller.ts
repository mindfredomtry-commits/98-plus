/**
 * Stage 8 Phase 8/9H — Notifications domain controller / port.
 *
 * Long-lived adapter: Runtime ↔ Presenter. Not owned by Surface mount.
 * Session completion only from Runtime SESSION_COMPLETE (Close release),
 * tagged with presentationSessionGeneration for stale-event ignore.
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
import type { NotificationsSessionCompleteMeta } from './notifications.open-types';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';
import { rec } from '@/notifications/diagnostics/notifications-recorder-bridge';

export type NotificationsListener = (state: NotificationsDomainState) => void;

export type NotificationsDomainSink = {
  sessionCompleted(meta: NotificationsSessionCompleteMeta): void;
};

export type NotificationsActivateNextResult = {
  outcome: NotificationsActivationOutcome;
  activationGeneration: number;
  presentationSessionGeneration: number;
  activeItemId: string | null;
};

export type NotificationsController = {
  getState(): NotificationsDomainState;
  subscribe(listener: NotificationsListener): () => void;
  dispatch(intent: NotificationsIntent): void;
  /** Phase 9H — begin a new presentation session (OPEN path). */
  beginPresentationSession(): number;
  /** Phase 9H — activate FIFO head for the current session. */
  activateNext(correlationId?: string): NotificationsActivateNextResult;
  getPresentationSessionGeneration(): number;
  getActivationGeneration(): number;
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
  let presentationSessionGeneration = 0;
  /** Session gen captured at CLOSE so delayed completes stay tagged. */
  let closingSessionGeneration: number | null = null;
  const listeners = new Set<NotificationsListener>();
  const controllerIdentity = `notifications-controller:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  rec('controller', 'CONTROLLER_CREATED', {
    metadata: {
      controllerIdentity,
      storeId: (input.store as { chaosStoreId?: string }).chaosStoreId ?? null,
    },
  });

  const intents = createNotificationIntents({
    store: input.store,
    getToken: input.getToken,
    getUserId: input.getUserId,
    onRefresh: input.onRefresh,
  });

  function emitSessionComplete(reason: 'action' | 'close' | 'no_ready'): void {
    const gen =
      closingSessionGeneration ?? presentationSessionGeneration;
    closingSessionGeneration = null;
    input.sink?.sessionCompleted({
      presentationSessionGeneration: gen,
      reason,
    });
  }

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
        onSessionComplete: (reason) => {
          emitSessionComplete(reason);
        },
      },
    );
  }

  function project(): NotificationsDomainState {
    return selectNotificationsDomainState(
      input.store.getState(),
      lastActivationOutcome,
      activationGeneration,
      presentationSessionGeneration,
    );
  }

  let cachedState: NotificationsDomainState = project();
  let lastPublishedFingerprint: string | null = null;

  function snapshotFingerprint(s: NotificationsDomainState): string {
    return [
      s.activation.type,
      s.activeItem?.itemId ?? '',
      s.activationGeneration,
      s.presentationSessionGeneration,
      s.actionStatus,
    ].join(':');
  }

  function emit(): void {
    const rt = input.store.getState();
    rec('controller', 'CONTROLLER_RUNTIME_SNAPSHOT_RECEIVED', {
      stateAfter: {
        revision: rt.revision,
        syncStatus: rt.syncStatus,
        activeItemId: rt.activeItemId,
        passiveItemIds: [...rt.passiveItemIds],
        activationGeneration,
        presentationSessionGeneration,
      },
    });
    cachedState = project();
    const fp = snapshotFingerprint(cachedState);
    if (fp === lastPublishedFingerprint) {
      rec('controller', 'CONTROLLER_SNAPSHOT_DEDUPED', {
        metadata: {
          fingerprint: fp,
          subscriberCount: listeners.size,
          controllerIdentity,
        },
      });
    } else {
      lastPublishedFingerprint = fp;
      rec('controller', 'CONTROLLER_SNAPSHOT_PUBLISHED', {
        stateAfter: {
          activeItemId: cachedState.activeItem?.itemId ?? null,
          activationGeneration: cachedState.activationGeneration,
          presentationSessionGeneration:
            cachedState.presentationSessionGeneration,
          subscriberCount: listeners.size,
        },
      });
    }
    // Always notify listeners — dedupe is observational only.
    for (const listener of [...listeners]) {
      listener(cachedState);
    }
  }

  const unsubscribeStore = input.store.subscribe(() => {
    if (disposed) return;
    emit();
  });

  function runActivate(
    correlationId: string,
  ): NotificationsActivateNextResult {
    const rtBefore = input.store.getState();
    rec('controller', 'RUNTIME_ACTIVATE_BEGIN', {
      correlationId,
      stateBefore: {
        syncStatus: rtBefore.syncStatus,
        revision: rtBefore.revision,
        activeItemId: rtBefore.activeItemId,
        passiveItemIds: [...rtBefore.passiveItemIds],
        activationGeneration,
        presentationSessionGeneration,
      },
    });
    logNotificationsSyncDiag(correlationId, 'RUNTIME_ACTIVATE_BEGIN', {
      syncStatus: rtBefore.syncStatus,
      revision: rtBefore.revision,
      activeItemId: rtBefore.activeItemId,
      passiveItemIds: [...rtBefore.passiveItemIds],
      activationGeneration,
      presentationSessionGeneration,
    });
    logNotificationsSyncDiag(correlationId, 'ACTIVATE_EVENT_DISPATCHED', {
      syncStatus: rtBefore.syncStatus,
      revision: rtBefore.revision,
      activeItemId: rtBefore.activeItemId,
      passiveItemIds: [...rtBefore.passiveItemIds],
      activationGeneration,
      presentationSessionGeneration,
    });
    rec('controller', 'RUNTIME_COMMAND_RECEIVED', {
      correlationId,
      metadata: { command: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' },
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
    rec('controller', 'RUNTIME_NEXT_ITEM_SELECTED', {
      correlationId,
      stateAfter: {
        activeItemId: rtAfter.activeItemId,
        outcome: lastActivationOutcome.type,
      },
    });
    rec('controller', 'RUNTIME_ACTIVATE_RESULT', {
      correlationId,
      result: lastActivationOutcome.type,
      stateAfter: {
        activeItemId: rtAfter.activeItemId,
        passiveItemIds: [...rtAfter.passiveItemIds],
        activationGeneration,
        presentationSessionGeneration,
      },
    });
    logNotificationsSyncDiag(correlationId, 'RUNTIME_ACTIVATE_RESULT', {
      outcome: lastActivationOutcome,
      activeItemId: rtAfter.activeItemId,
      passiveItemIds: [...rtAfter.passiveItemIds],
      activationGeneration,
      presentationSessionGeneration,
    });
    logNotificationsSyncDiag(correlationId, 'ACTIVATE_EVENT_RESULT', {
      outcome: lastActivationOutcome,
      activeItemId: rtAfter.activeItemId,
      passiveItemIds: [...rtAfter.passiveItemIds],
      activationGeneration,
    });
    void drainEffects();
    emit();
    logNotificationsSyncDiag(correlationId, 'RUNTIME_AFTER_ACTIVATION', {
      syncStatus: rtAfter.syncStatus,
      revision: rtAfter.revision,
      activeItemId: rtAfter.activeItemId,
      passiveItemIds: [...rtAfter.passiveItemIds],
    });
    logNotificationsSyncDiag(
      correlationId,
      'CONTROLLER_SNAPSHOT_AFTER_ACTIVATION',
      {
        activation: cachedState.activation,
        activeItemId: cachedState.activeItem?.itemId ?? null,
        activationGeneration: cachedState.activationGeneration,
        presentationSessionGeneration:
          cachedState.presentationSessionGeneration,
        lastActivationOutcome: cachedState.lastActivationOutcome,
      },
    );
    return {
      outcome: lastActivationOutcome,
      activationGeneration,
      presentationSessionGeneration,
      activeItemId: rtAfter.activeItemId,
    };
  }

  const controller: NotificationsController = {
    getState() {
      return cachedState;
    },

    subscribe(listener) {
      listeners.add(listener);
      rec('controller', 'CONTROLLER_SUBSCRIBE', {
        metadata: {
          controllerIdentity,
          subscriberCount: listeners.size,
        },
      });
      return () => {
        listeners.delete(listener);
        rec('controller', 'CONTROLLER_UNSUBSCRIBE', {
          metadata: {
            controllerIdentity,
            subscriberCount: listeners.size,
          },
        });
      };
    },

    beginPresentationSession() {
      if (disposed) return presentationSessionGeneration;
      presentationSessionGeneration += 1;
      emit();
      return presentationSessionGeneration;
    },

    activateNext(correlationId) {
      if (disposed) {
        return {
          outcome: { type: 'NO_READY_ITEM' },
          activationGeneration,
          presentationSessionGeneration,
          activeItemId: null,
        };
      }
      return runActivate(
        correlationId ?? nextNotificationsSyncCorrelationId('activate'),
      );
    },

    getPresentationSessionGeneration() {
      return presentationSessionGeneration;
    },

    getActivationGeneration() {
      return activationGeneration;
    },

    dispatch(intent) {
      if (disposed) return;

      switch (intent.type) {
        case 'ACTIVATE_READY_ITEM_REQUESTED': {
          runActivate(nextNotificationsSyncCorrelationId('activate'));
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
          closingSessionGeneration = presentationSessionGeneration;
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_INTENT', {
            activeItemId: before.activeItemId,
            passiveItemIds: [...before.passiveItemIds],
            syncStatus: before.syncStatus,
            revision: before.revision,
            activationGeneration,
            presentationSessionGeneration,
          });
          const closedItemId = before.activeItemId;
          rec('controller', 'RUNTIME_DEACTIVATE_BEGIN', {
            correlationId: closeDiagId,
            stateBefore: {
              activeItemId: before.activeItemId,
              passiveItemIds: [...before.passiveItemIds],
              presentationSessionGeneration,
              activationGeneration,
            },
          });
          const closeResult = input.store.dispatch({
            type: 'ACTIVE_ITEM_CLOSE_REQUESTED',
            source: 'user',
          });
          const after = input.store.getState();
          logNotificationsSyncDiag(closeDiagId, 'RUNTIME_ITEM_DEACTIVATED', {
            previousActiveItemId: closedItemId,
            activeItemId: after.activeItemId,
            presentationSessionGeneration,
          });
          rec('controller', 'RUNTIME_ITEM_REINSERTED', {
            correlationId: closeDiagId,
            stateAfter: {
              previousActiveItemId: closedItemId,
              activeItemId: after.activeItemId,
              passiveItemIds: [...after.passiveItemIds],
              reinserted: closedItemId,
              presentationRetained: closedItemId
                ? Boolean(after.presentationByItemId[closedItemId])
                : true,
            },
          });
          logNotificationsSyncDiag(closeDiagId, 'RUNTIME_ITEM_REINSERTED', {
            passiveItemIds: [...after.passiveItemIds],
            reinserted: closedItemId,
            presentationRetained: closedItemId
              ? Boolean(after.presentationByItemId[closedItemId])
              : true,
          });
          rec('controller', 'RUNTIME_DEACTIVATE_END', {
            correlationId: closeDiagId,
            stateAfter: {
              activeItemId: after.activeItemId,
              passiveItemIds: [...after.passiveItemIds],
              effectTypes: closeResult.effects.map((e) => e.type),
            },
          });
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_RUNTIME_DISPATCH_RESULT', {
            activeItemId: after.activeItemId,
            passiveItemIds: [...after.passiveItemIds],
            syncStatus: after.syncStatus,
            revision: after.revision,
            effects: closeResult.effects.map((e) => e.type),
          });
          for (const effect of closeResult.effects) {
            rec('controller', 'RUNTIME_EFFECT_CREATED', {
              correlationId: closeDiagId,
              metadata: {
                effectType: effect.type,
                reason:
                  effect.type === 'SESSION_COMPLETE' ? effect.reason : null,
              },
            });
            if (effect.type === 'SESSION_COMPLETE') {
              rec('controller', 'RUNTIME_SESSION_COMPLETE_CREATED', {
                correlationId: closeDiagId,
                metadata: {
                  reason: effect.reason,
                  presentationSessionGeneration:
                    closingSessionGeneration ?? presentationSessionGeneration,
                },
              });
            }
          }
          logNotificationsSyncDiag(closeDiagId, 'CLOSE_EFFECTS', {
            effects: closeResult.effects.map((e) =>
              e.type === 'SESSION_COMPLETE'
                ? { type: e.type, reason: e.reason }
                : { type: e.type },
            ),
          });
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
              onSessionComplete: (reason) => {
                logNotificationsSyncDiag(
                  closeDiagId,
                  'RUNTIME_SESSION_COMPLETE',
                  {
                    reason,
                    presentationSessionGeneration:
                      closingSessionGeneration ??
                      presentationSessionGeneration,
                  },
                );
                emitSessionComplete(reason);
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
      rec('controller', 'CONTROLLER_DISPOSED', {
        metadata: { controllerIdentity },
      });
    },
  };

  void selectActiveItemId;
  return controller;
}
