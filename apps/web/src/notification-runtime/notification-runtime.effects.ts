/**
 * Stage 8 Phase 8 — Runtime effects (submit + sync request + session complete).
 */
import { api } from '@/lib/api';
import { postOverboardWithTrace } from '@/lib/overboard-api';
import {
  executeSubmitCardActionEffect,
  type CheckSubmitTransport,
} from './notification-runtime.check-action';
import {
  executeSubmitIncomingOverboardEffect,
  type OverboardSubmitTransport,
} from './notification-runtime.overboard-action';
import type { NotificationRuntimeStore } from './notification-runtime.store';
import type { RuntimeEffect } from './notification-runtime.types';

export type NotificationEffectsContext = {
  getToken: () => string | null;
  getUserId?: () => string | null;
  onRefreshPending?: (reason: string) => void | Promise<void>;
  onRequestFullSync?: (reason: string) => void;
  onSessionComplete?: (reason: 'action' | 'close' | 'no_ready') => void;
};

const checkTransport: CheckSubmitTransport = async ({
  banId,
  completed,
  token,
}) => {
  const res = await api<{
    result?: import('@98plus/shared').BanResult;
    done?: boolean;
    waiting?: boolean;
    notifications?: import('@98plus/shared').NotificationsDeltaV1 | null;
  }>(`/bans/${encodeURIComponent(banId)}/check`, {
    method: 'POST',
    token,
    body: JSON.stringify({ completed }),
  });
  return {
    done: Boolean(res.done),
    waiting: res.waiting,
    result: res.result,
    notifications: res.notifications ?? null,
  };
};

const overboardTransport: OverboardSubmitTransport = async ({
  banId,
  token,
}) => {
  const res = await postOverboardWithTrace(banId, token);
  return {
    ok: res.ok !== false,
    result: res.result ?? null,
    error: res.error,
    explicitNoResult: Boolean(
      (res as { explicitNoResult?: boolean }).explicitNoResult,
    ),
    notifications: res.notifications ?? null,
  };
};

export async function runNotificationRuntimeEffects(
  store: NotificationRuntimeStore,
  effects: readonly RuntimeEffect[],
  ctx: NotificationEffectsContext,
): Promise<void> {
  const token = ctx.getToken();
  const userId = ctx.getUserId?.() ?? '';
  for (const effect of effects) {
    switch (effect.type) {
      case 'SUBMIT_CARD_ACTION': {
        if (!token) {
          store.dispatch({
            type: 'CARD_ACTION_FAILED',
            commandId: effect.commandId,
            targetItemId: effect.targetItemId,
            errorCode: 'NO_TOKEN',
            source: 'system',
          });
          break;
        }
        if (effect.action === 'check_answer') {
          await executeSubmitCardActionEffect(
            store,
            effect,
            checkTransport,
            token,
            userId,
          );
        } else if (effect.action === 'incoming_overboard') {
          await executeSubmitIncomingOverboardEffect(
            store,
            effect,
            overboardTransport,
            token,
            userId,
          );
        }
        break;
      }
      case 'REFRESH_PENDING': {
        await ctx.onRefreshPending?.(effect.reason);
        break;
      }
      case 'REQUEST_FULL_SYNC': {
        ctx.onRequestFullSync?.(effect.reason);
        break;
      }
      case 'SESSION_COMPLETE': {
        ctx.onSessionComplete?.(effect.reason);
        break;
      }
      default:
        break;
    }
  }
}
