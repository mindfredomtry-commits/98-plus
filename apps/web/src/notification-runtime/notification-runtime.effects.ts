/**
 * Phase 0 — central NotificationRuntime effect runner.
 * No legacy sinks / overlayQueueRef / dual-write.
 */
import { api } from '@/lib/api';
import { postOverboardWithTrace } from '@/lib/overboard-api';
import { EMPTY_RUNTIME_LEGACY_SINKS } from './notification-runtime.demolition';
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
  /** Optional pending refresh hook (transport). */
  onRefreshPending?: (reason: string) => void | Promise<void>;
  /** Optional next-prefetch (transport). */
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

/**
 * Run effects produced by the last dispatch. Safe no-op for unknown types.
 * Never writes queue/display through legacy sinks.
 */
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
            EMPTY_RUNTIME_LEGACY_SINKS,
          );
        } else if (effect.action === 'incoming_overboard') {
          await executeSubmitIncomingOverboardEffect(
            store,
            effect,
            overboardTransport,
            token,
            EMPTY_RUNTIME_LEGACY_SINKS,
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
      case 'ANALYTICS_EVENT':
      case 'FETCH_DIRECT_ITEM':
        // Consumed is already applied by reducer; analytics/direct handled elsewhere.
        break;
      default:
        break;
    }
  }
}
