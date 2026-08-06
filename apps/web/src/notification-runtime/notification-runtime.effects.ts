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
import {
  executeSubmitResultAckEffect,
  type ResultAckTransport,
} from './notification-runtime.result-ack-action';
import type { NotificationRuntimeStore } from './notification-runtime.store';
import type { RuntimeEffect } from './notification-runtime.types';
import { rec } from '@/notifications/diagnostics/notifications-recorder-bridge';

export type NotificationEffectsContext = {
  getToken: () => string | null;
  getUserId?: () => string | null;
  onRefreshPending?: (reason: string) => void | Promise<void>;
  onRequestFullSync?: (reason: string) => void;
  onSessionComplete?: (reason: 'action' | 'close' | 'no_ready') => void;
  /** Test / adapter override for POST /bans/:id/result/ack */
  resultAckTransport?: ResultAckTransport;
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

const resultAckTransportDefault: ResultAckTransport = async ({
  banId,
  token,
}) => {
  const res = await api<{
    ok?: boolean;
    notifications?: import('@98plus/shared').NotificationsDeltaV1 | null;
  }>(`/bans/${encodeURIComponent(banId)}/result/ack`, {
    method: 'POST',
    token,
  });
  return {
    ok: res.ok !== false,
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
    rec('runtime', 'RUNTIME_EFFECT_EXECUTED', {
      metadata: {
        effectType: effect.type,
        reason: effect.type === 'SESSION_COMPLETE' ? effect.reason : null,
      },
    });
    try {
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
          } else if (effect.action === 'result_ack') {
            await executeSubmitResultAckEffect(
              store,
              effect,
              ctx.resultAckTransport ?? resultAckTransportDefault,
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
      rec('runtime', 'RUNTIME_EFFECT_COMPLETED', {
        result: 'ok',
        metadata: {
          effectType: effect.type,
          reason: effect.type === 'SESSION_COMPLETE' ? effect.reason : null,
        },
      });
    } catch (err) {
      rec('runtime', 'RUNTIME_EFFECT_COMPLETED', {
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
        metadata: { effectType: effect.type },
      });
      throw err;
    }
  }
}
