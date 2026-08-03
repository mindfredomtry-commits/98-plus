/**
 * Result card acknowledgement — SUBMIT_CARD_ACTION(result_ack).
 *
 * Server: POST /bans/:id/result/ack (acknowledgeBanResult).
 * Runtime never imports HTTP; transport is injected by the effects runner.
 *
 * Success → CARD_ACTION_SUCCEEDED(consumeAndAdvance) → local consume + refresh.
 * Failure → CARD_ACTION_FAILED; item stays active for retry.
 */
import { normalizeId } from '@/lib/normalize-json';
import {
  selectCurrentItem,
  selectIsActionBlocked,
} from './notification-runtime.selectors';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import type {
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type ResultAckTransport = (input: {
  banId: string;
  token: string;
}) => Promise<{ ok: true } | { ok: false; errorCode: string; status?: number }>;

function banIdFromResultItemId(itemId: string): string {
  return itemId.startsWith('result:')
    ? itemId.slice('result:'.length)
    : itemId;
}

/**
 * Explicit dismiss entry: CARD_ACTION_REQUESTED(result_ack) only.
 * Does not consume locally until the effect succeeds.
 */
export function requestResultAckAction(
  store: NotificationRuntimeStore,
  args: {
    banId?: string;
    source?: RuntimeSource;
    commandId?: string;
  } = {},
): {
  accepted: boolean;
  commandId: string | null;
  effects: RuntimeEffect[];
  reason?: string;
} {
  if (selectIsActionBlocked(store.getState())) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'action-blocked',
    };
  }
  const current = selectCurrentItem(store.getState());
  if (!current || current.kind !== 'result') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'current-not-result',
    };
  }
  const targetItemId = notificationItemId(current);
  const headBanId = normalizeId(current.result.id);
  if (args.banId && normalizeId(args.banId) !== headBanId) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'ban-mismatch',
    };
  }
  const commandId =
    args.commandId ?? nextRuntimeTransitionId(`result-ack:${headBanId}`);
  const result = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId,
    targetItemId,
    action: 'result_ack',
    source: args.source ?? 'user',
  });
  return {
    accepted: true,
    commandId,
    effects: result.effects,
  };
}

/**
 * Execute SUBMIT_CARD_ACTION(result_ack) — sole production ack caller for results.
 */
export async function executeSubmitResultAckEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: ResultAckTransport,
  token: string,
): Promise<void> {
  if (effect.action !== 'result_ack') return;
  const banId = banIdFromResultItemId(effect.targetItemId);
  if (!banId) {
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'RESULT_ACK_MISSING_BAN',
      source: 'user',
    });
    return;
  }

  try {
    const res = await transport({ banId, token });
    if (res.ok) {
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        consumeAndAdvance: true,
        source: 'user',
      });
      return;
    }
    // 404 / already-unseeable → idempotent success (consume locally).
    if (res.status === 404 || res.errorCode === 'RESULT_ACK_ALREADY_SEEN') {
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        consumeAndAdvance: true,
        source: 'user',
      });
      return;
    }
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: res.errorCode || 'RESULT_ACK_FAILED',
      source: 'user',
    });
  } catch {
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'RESULT_ACK_NETWORK',
      source: 'user',
    });
  }
}
