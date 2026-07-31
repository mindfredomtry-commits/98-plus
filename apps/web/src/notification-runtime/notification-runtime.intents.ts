/**
 * Stage 7 Phase 1 — public intents wrapping queue/lifecycle commands only.
 * No Reply / Product / Bans navigation.
 */
import { requestCheckCardAction } from './notification-runtime.check-action';
import { runNotificationRuntimeEffects } from './notification-runtime.effects';
import type {
  NotificationIntentResult,
  NotificationIntents,
} from './notification-runtime.host-api';
import { selectNotificationViewState } from './notification-runtime.host-api';
import { requestIncomingOverboardAction } from './notification-runtime.overboard-action';
import {
  dismissRuntimeHead,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import type { CardDismissReason } from './notification-runtime.types';

export type NotificationIntentsDeps = {
  store: NotificationRuntimeStore;
  getToken: () => string | null;
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
      onRefreshPending: async () => {
        await deps.onRefresh?.('user');
      },
    });
  };

  return {
    async accept() {
      const view = selectNotificationViewState(store.getState());
      const card = view.readyHead;
      if (!card || card.kind !== 'incoming') {
        return fail('no-incoming-card');
      }
      if (view.isProcessingAction) {
        return fail('action-blocked');
      }
      const requested = requestIncomingOverboardAction(store, {
        banId: card.ban.id,
        source: 'user',
      });
      if (!requested.accepted) {
        return fail(requested.reason ?? 'overboard-rejected');
      }
      await runEffects();
      return ok();
    },

    async confirmCheck(completed: boolean) {
      const view = selectNotificationViewState(store.getState());
      const card = view.readyHead;
      if (!card || card.kind !== 'check') {
        return fail('no-check-card');
      }
      if (view.isProcessingAction) {
        return fail('action-blocked');
      }
      const requested = requestCheckCardAction(store, {
        banId: card.ban.id,
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
      const view = selectNotificationViewState(store.getState());
      const card = view.readyHead;
      if (!card || card.kind !== 'result') {
        return fail('no-result-card');
      }
      const dismissReason: CardDismissReason = reason;
      dismissRuntimeHead(store, card.itemId, dismissReason, 'user');
      await runEffects();
      return ok();
    },

    async dismissCurrent(reason = 'user_dismiss') {
      const view = selectNotificationViewState(store.getState());
      const card = view.readyHead;
      if (!card) return fail('no-card');
      dismissRuntimeHead(store, card.itemId, reason, 'user');
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
