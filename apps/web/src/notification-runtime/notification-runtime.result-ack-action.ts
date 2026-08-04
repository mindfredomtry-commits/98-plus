/**
 * Result card acknowledgement — SUBMIT_CARD_ACTION(result_ack).
 *
 * Server: POST /bans/:id/result/ack → truthful notifications delta (REMOVE).
 * Success → CARD_ACTION_SUCCEEDED with delta + active REMOVE authorization.
 * Failure → CARD_ACTION_FAILED; item stays active for retry.
 *
 * Does not invent revision/sequence. Does not consume locally without delta.
 */
import { normalizeId } from '@/lib/normalize-json';
import {
  selectActiveItem,
  selectIsActionBlocked,
} from './notification-runtime.selectors';
import {
  nextRuntimeTransitionId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import { notificationItemId } from './notification-runtime.types';
import type { RuntimeEffect, RuntimeSource } from './notification-runtime.types';
import { parseNotificationsDeltaV1 } from './notifications-mapper';

export type ResultAckApiResponse = {
  ok?: boolean;
  error?: string;
  notifications?: import('@98plus/shared').NotificationsDeltaV1 | null;
};

export type ResultAckTransport = (input: {
  banId: string;
  token: string;
}) => Promise<ResultAckApiResponse>;

function banIdFromResultItemId(itemId: string): string {
  return itemId.startsWith('result:')
    ? itemId.slice('result:'.length)
    : itemId;
}

export function requestResultAckAction(
  store: NotificationRuntimeStore,
  args: {
    banId: string;
    source?: RuntimeSource;
    commandId?: string;
  },
): {
  accepted: boolean;
  commandId: string | null;
  effects: RuntimeEffect[];
  reason?: string;
} {
  if (store.getState().syncStatus !== 'READY') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'sync-not-ready',
    };
  }
  if (selectIsActionBlocked(store.getState())) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'action-blocked',
    };
  }
  const active = selectActiveItem(store.getState());
  if (!active || active.kind !== 'result') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'active-not-result',
    };
  }
  const targetItemId = notificationItemId(active);
  if (normalizeId(active.result.id) !== normalizeId(args.banId)) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'ban-mismatch',
    };
  }
  if (store.getState().activeItemId !== targetItemId) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'active-mismatch',
    };
  }
  const commandId =
    args.commandId ?? nextRuntimeTransitionId('result-ack-action');
  const result = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId,
    targetItemId,
    action: 'result_ack',
    source: args.source ?? 'user',
  });
  const submitEffects = result.effects.filter(
    (e): e is Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }> =>
      e.type === 'SUBMIT_CARD_ACTION',
  );
  return {
    accepted: submitEffects.length > 0,
    commandId: submitEffects.length > 0 ? commandId : null,
    effects: result.effects,
    reason: submitEffects.length > 0 ? undefined : 'reducer-rejected',
  };
}

export async function executeSubmitResultAckEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: ResultAckTransport,
  token: string,
  _userId: string,
): Promise<void> {
  if (effect.action !== 'result_ack') return;
  const banId = banIdFromResultItemId(effect.targetItemId);
  try {
    const res = await transport({ banId, token });
    if (res.error || res.ok === false) {
      store.dispatch({
        type: 'CARD_ACTION_FAILED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        errorCode: res.error ?? 'RESULT_ACK_FAILED',
        source: 'user',
      });
      return;
    }

    const delta = parseNotificationsDeltaV1(res.notifications ?? null);
    if (delta) {
      const { presentationMapFromDelta } = await import('./notifications-mapper');
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        delta,
        presentationByItemId: presentationMapFromDelta(delta),
        promoteCausalNext: true,
        source: 'user',
      });
      return;
    }

    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'AWAITING_TRUTHFUL_SYNC',
      source: 'user',
    });
    store.dispatch({
      type: 'SYNC_RECOVERY_STARTED',
      transitionId: nextRuntimeTransitionId('result-ack-sync'),
      source: 'system',
    });
  } catch {
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'RESULT_ACK_SUBMIT_FAILED',
      source: 'user',
    });
  }
}
