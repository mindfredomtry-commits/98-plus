/**
 * Stage 8 Phase 8 — host intents targeting activeItemId only.
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
import { selectActiveItem } from './notification-runtime.selectors';
import type { NotificationRuntimeStore } from './notification-runtime.store';

export type NotificationIntentsDeps = {
  store: NotificationRuntimeStore;
  getToken: () => string | null;
  getUserId?: () => string | null;
  onRefresh?: (reason: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
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

  const runEffects = async () => {
    await runNotificationRuntimeEffects(store, store.getLastEffects(), {
      getToken,
      getUserId: deps.getUserId,
      onRefreshPending: async () => {
        await deps.onRefresh?.('user');
      },
    });
  };

  return {
    async accept() {
      const read = selectNotificationQueueReadModel(store.getState());
      const active = selectActiveItem(store.getState());
      if (!active || active.kind !== 'incoming') {
        return fail('no-incoming-card');
      }
      if (read.actionBlocked) {
        return fail('action-blocked');
      }
      const requested = requestIncomingOverboardAction(store, {
        banId: active.ban.id,
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
      const active = selectActiveItem(store.getState());
      if (!active || active.kind !== 'check') {
        return fail('no-check-card');
      }
      if (read.actionBlocked) {
        return fail('action-blocked');
      }
      const requested = requestCheckCardAction(store, {
        banId: active.ban.id,
        completed,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'check-rejected');
      }
      await runEffects();
      return ok();
    },

    async dismissResult(_reason = 'close_result') {
      const read = selectNotificationQueueReadModel(store.getState());
      const active = selectActiveItem(store.getState());
      if (!active || active.kind !== 'result') {
        return fail('no-result-card');
      }
      if (read.actionBlocked) {
        return fail('action-blocked');
      }
      const requested = requestResultAckAction(store, {
        banId: active.result.id,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'result-ack-rejected');
      }
      await runEffects();
      return ok();
    },

    async dismissCurrent(_reason = 'user_dismiss') {
      const active = selectActiveItem(store.getState());
      if (!active) return fail('no-card');
      store.dispatch({
        type: 'ACTIVE_ITEM_CLOSE_REQUESTED',
        source: 'user',
      });
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
