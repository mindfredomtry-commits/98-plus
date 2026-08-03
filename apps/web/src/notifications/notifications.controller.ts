/**
 * Notifications domain controller / port — Stage 8 Phase 5.
 * Wraps Notification Runtime; Coordinator never imports the store.
 * No CreateBan / Settings / React / application-owner imports.
 *
 * Snapshot identity: getState() returns a cached projection. useSyncExternalStore
 * requires Object.is(getSnapshot(), getSnapshot()) while nothing mutated.
 */
import type { DomainAvailability } from '@/domain-availability';
import type { DomainCapability } from '@/domain-capability';
import { createNotificationIntents } from '@/notification-runtime/notification-runtime.intents';
import {
  selectActiveItem,
  selectActiveItemId,
  selectReadyHeadId,
} from '@/notification-runtime/notification-runtime.selectors';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import { notificationItemId } from '@/notification-runtime/notification-runtime.types';
import { mapNotificationsAvailability } from './notifications.availability';
import { mapNotificationsCapability } from './notifications.capability';
import { selectNotificationsDomainState } from './notifications.selectors';
import type {
  NotificationsActivationOutcome,
  NotificationsDomainState,
  NotificationsIntent,
} from './notifications.types';

export type NotificationsListener = (state: NotificationsDomainState) => void;

export type NotificationsDomainSink = {
  /** Active item completed and activation cleared — request application release. */
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
  onRefresh?: (reason: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
  sink?: NotificationsDomainSink;
  /** Test override for POST /bans/:id/result/ack */
  resultAckTransport?: import('@/notification-runtime/notification-runtime.result-ack-action').ResultAckTransport;
}): NotificationsController {
  let disposed = false;
  let lastActivationOutcome: NotificationsActivationOutcome | null = null;
  let previousActiveId: string | null = selectActiveItemId(
    input.store.getState(),
  );
  const listeners = new Set<NotificationsListener>();

  const intents = createNotificationIntents({
    store: input.store,
    getToken: input.getToken,
    onRefresh: input.onRefresh,
    resultAckTransport: input.resultAckTransport,
  });

  function project(): NotificationsDomainState {
    return selectNotificationsDomainState(
      input.store.getState(),
      lastActivationOutcome,
    );
  }

  /** Stable external-store snapshot — replaced only on real mutations. */
  let cachedState: NotificationsDomainState = project();

  function emit(): void {
    cachedState = project();
    for (const listener of [...listeners]) {
      listener(cachedState);
    }
  }

  function noteActivationClearedAfterSession(): void {
    const runtime = input.store.getState();
    const nextActive = selectActiveItemId(runtime);
    if (previousActiveId != null && nextActive == null) {
      const completedId = previousActiveId;
      previousActiveId = null;
      // Release only when the claimed item left the queue (consume/dismiss).
      // CLEAR_ACTIVATION / close-without-consume must not look like completion.
      const stillQueued = runtime.items.queue.some(
        (item) => notificationItemId(item) === completedId,
      );
      if (!stillQueued) {
        input.sink?.sessionCompleted();
      }
      emit();
      return;
    }
    previousActiveId = nextActive;
    emit();
  }

  const unsubscribeStore = input.store.subscribe(() => {
    if (disposed) return;
    noteActivationClearedAfterSession();
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
          const runtimeState = input.store.getState();
          const before = selectActiveItemId(runtimeState);
          const beforeItem = selectActiveItem(runtimeState);
          // Stale claim (id not in queue) must not block ready-head activation.
          if (before && beforeItem) {
            lastActivationOutcome = {
              type: 'ALREADY_ACTIVE',
              itemId: before,
            };
            emit();
            return;
          }
          if (before && !beforeItem) {
            previousActiveId = null;
            input.store.dispatch({
              type: 'CLEAR_ACTIVATION_REQUESTED',
              source: 'system',
            });
          }
          const readyId = selectReadyHeadId(input.store.getState());
          if (!readyId) {
            lastActivationOutcome = { type: 'NO_READY_ITEM' };
            emit();
            return;
          }
          input.store.dispatch({
            type: 'ACTIVATE_READY_ITEM_REQUESTED',
            source: 'user',
          });
          const after = selectActiveItemId(input.store.getState());
          const afterItem = selectActiveItem(input.store.getState());
          lastActivationOutcome =
            after && afterItem
              ? { type: 'ACTIVATED', itemId: after }
              : { type: 'NO_READY_ITEM' };
          previousActiveId = after && afterItem ? after : null;
          emit();
          return;
        }

        case 'CLEAR_ACTIVATION_REQUESTED':
        case 'ACTIVE_ITEM_CLOSE_REQUESTED': {
          // Clear claim only — do not consume queue; do not auto-activate next.
          // Close path releases via application intent; suppress sessionCompleted.
          previousActiveId = null;
          input.store.dispatch({
            type: 'CLEAR_ACTIVATION_REQUESTED',
            source: 'user',
          });
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
          if (!active || runtime.action.status !== 'failed') return;
          if (active.kind === 'incoming') {
            void intents.accept();
            return;
          }
          if (active.kind === 'check') {
            void intents.confirmCheck(true);
            return;
          }
          if (active.kind === 'result') {
            void intents.dismissResult('close_result');
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

  return controller;
}
