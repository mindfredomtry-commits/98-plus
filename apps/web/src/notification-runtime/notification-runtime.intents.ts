/**
 * Stage 7 Phase 2 — public intents wrapping queue/lifecycle commands only.
 * No Reply / Product / Bans navigation.
 */
import { requestCheckCardAction } from './notification-runtime.check-action';
import { runNotificationRuntimeEffects } from './notification-runtime.effects';
import type {
  NotificationIntentResult,
  NotificationIntents,
} from './notification-runtime.host-api';
import { selectNotificationQueueReadModel } from './notification-runtime.host-api';
import { requestIncomingOverboardAction } from './notification-runtime.overboard-action';
import { requestResultAckAction } from './notification-runtime.result-ack-action';
import { selectCurrentItem } from './notification-runtime.selectors';
import {
  dismissRuntimeHead,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  notificationItemId,
} from './notification-runtime.types';

export type NotificationIntentsDeps = {
  store: NotificationRuntimeStore;
  getToken: () => string | null;
  onRefresh?: (reason: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
  /** Test override — production uses effects default HTTP adapter. */
  resultAckTransport?: import('./notification-runtime.result-ack-action').ResultAckTransport;
};

function fail(reason: string): NotificationIntentResult {
  return { accepted: false, reason };
}

function ok(): NotificationIntentResult {
  return { accepted: true };
}

export function createNotificationIntents(
  deps: NotificationIntentsDeps,
): NotificationIntents {
  const { store, getToken } = deps;

  const effectsCtx = {
    getToken,
    onRefreshPending: async () => {
      await deps.onRefresh?.('user');
    },
    resultAckTransport: deps.resultAckTransport,
  };

  const runEffects = async () => {
    const batch = store.getLastEffects();
    await runNotificationRuntimeEffects(store, batch, effectsCtx);
    // Action executors may dispatch consume/refresh; drain one follow-up batch.
    const followUp = store.getLastEffects();
    if (followUp.length > 0 && followUp !== batch) {
      await runNotificationRuntimeEffects(store, followUp, effectsCtx);
    }
  };

  return {
    async accept() {
      const read = selectNotificationQueueReadModel(store.getState());
      const head = selectCurrentItem(store.getState());
      if (!head || head.kind !== 'incoming') {
        return fail('no-incoming-card');
      }
      if (read.actionBlocked) {
        return fail('action-blocked');
      }
      const requested = requestIncomingOverboardAction(store, {
        banId: head.ban.id,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'overboard-rejected');
      }
      await runEffects();
      return ok();
    },

    async confirmCheck(completed: boolean) {
      const read = selectNotificationQueueReadModel(store.getState());
      const head = selectCurrentItem(store.getState());
      if (!head || head.kind !== 'check') {
        return fail('no-check-card');
      }
      if (read.actionBlocked) {
        return fail('action-blocked');
      }
      const requested = requestCheckCardAction(store, {
        banId: head.ban.id,
        completed,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'check-rejected');
      }
      await runEffects();
      return ok();
    },

    async dismissResult(reason = 'close_result') {
      void reason;
      const head = selectCurrentItem(store.getState());
      if (!head || head.kind !== 'result') {
        return fail('no-result-card');
      }
      // Server ack first; local consume only on CARD_ACTION_SUCCEEDED.
      const requested = requestResultAckAction(store, {
        banId: head.result.id,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'result-ack-rejected');
      }
      await runEffects();
      return ok();
    },

    async dismissCurrent(reason = 'user_dismiss') {
      const head = selectCurrentItem(store.getState());
      if (!head) return fail('no-card');
      dismissRuntimeHead(store, notificationItemId(head), reason, 'user');
      await runEffects();
      return ok();
    },

    async refresh(reason = 'user') {
      if (!deps.onRefresh) return fail('no-refresh-handler');
      await deps.onRefresh(reason);
      return ok();
    },
  };
}
