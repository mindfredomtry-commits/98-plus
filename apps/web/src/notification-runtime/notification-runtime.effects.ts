/**
 * Stage 7 Phase 1 — NotificationRuntime effect runner.
 * No legacy sinks / dual-write.
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
  onRefreshPending?: (reason: string) => void | Promise<void>;
  onPrefetchNext?: (skipItemId?: string) => void | Promise<void>;
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
  }>(`/bans/${encodeURIComponent(banId)}/check`, {
    method: 'POST',
    token,
    body: JSON.stringify({ completed }),
  });
  return {
    done: Boolean(res.done),
    waiting: res.waiting,
    result: res.result,
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
  };
};

export async function runNotificationRuntimeEffects(
  store: NotificationRuntimeStore,
  effects: readonly RuntimeEffect[],
  ctx: NotificationEffectsContext,
): Promise<void> {
  const token = ctx.getToken();
  for (const effect of effects) {
    switch (effect.type) {
      case 'SUBMIT_CARD_ACTION': {
        if (!token) break;
        if (effect.action === 'check_answer') {
          await executeSubmitCardActionEffect(
            store,
            effect,
            checkTransport,
            token,
          );
        } else if (effect.action === 'incoming_overboard') {
          await executeSubmitIncomingOverboardEffect(
            store,
            effect,
            overboardTransport,
            token,
          );
        }
        break;
      }
      case 'FETCH_PENDING':
      case 'REFRESH_PENDING': {
        await ctx.onRefreshPending?.(
          effect.type === 'REFRESH_PENDING' ? effect.reason : 'fetch-pending',
        );
        break;
      }
      case 'PREFETCH_NEXT': {
        await ctx.onPrefetchNext?.(effect.skipItemId);
        break;
      }
      case 'MARK_CONSUMED':
      case 'FETCH_DIRECT_ITEM':
        break;
      default:
        break;
    }
  }
}
