/**
 * Stage 8 Phase 8 — overboard action targets activeItemId; completes via reconcile delta.
 */
import type { BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import {
  selectActiveItem,
  selectIsActionBlocked,
} from './notification-runtime.selectors';
import {
  nextRuntimeTransitionId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  buildRemoveDelta,
  itemFromResult,
  toCausalResultItemV1,
} from './notification-runtime.temporary-adapter';
import { notificationItemId } from './notification-runtime.types';
import type { RuntimeEffect, RuntimeSource } from './notification-runtime.types';

export type OverboardSubmitApiResponse = {
  ok?: boolean;
  result?: BanResult | null;
  error?: string;
  explicitNoResult?: boolean;
};

export type OverboardSubmitTransport = (input: {
  banId: string;
  token: string;
}) => Promise<OverboardSubmitApiResponse>;

export type OverboardSubmitOutcome = {
  ok: boolean;
  error?: string;
  materializedResultBanId?: string | null;
};

function banIdFromIncomingItemId(itemId: string): string {
  return itemId.startsWith('incoming:')
    ? itemId.slice('incoming:'.length)
    : itemId;
}

export function requestIncomingOverboardAction(
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
  if (selectIsActionBlocked(store.getState())) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'action-blocked',
    };
  }
  const active = selectActiveItem(store.getState());
  if (!active || active.kind !== 'incoming') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'active-not-incoming',
    };
  }
  const targetItemId = notificationItemId(active);
  if (normalizeId(active.ban.id) !== normalizeId(args.banId)) {
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
    args.commandId ?? nextRuntimeTransitionId('overboard-action');
  const result = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId,
    targetItemId,
    action: 'incoming_overboard',
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

export async function executeSubmitIncomingOverboardEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: OverboardSubmitTransport,
  token: string,
  userId: string,
): Promise<OverboardSubmitOutcome> {
  if (effect.action !== 'incoming_overboard') {
    return { ok: false, error: 'wrong-action' };
  }
  const banId = banIdFromIncomingItemId(effect.targetItemId);
  try {
    const res = await transport({ banId, token });
    if (res.error || res.ok === false) {
      store.dispatch({
        type: 'CARD_ACTION_FAILED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        errorCode: res.error ?? 'OVERBOARD_FAILED',
        source: 'user',
      });
      return { ok: false, error: res.error ?? 'OVERBOARD_FAILED' };
    }

    if (res.result) {
      const fromRevision = store.getState().revision ?? '0';
      const upsert = toCausalResultItemV1(
        res.result,
        userId,
        effect.targetItemId,
      );
      const { delta, presentationByItemId } = buildRemoveDelta({
        itemId: effect.targetItemId,
        fromRevision,
        upsert,
        presentationByItemId: {
          [upsert.itemId]: itemFromResult(res.result),
        },
      });
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        delta,
        presentationByItemId,
        promoteCausalNext: true,
        source: 'user',
      });
      return { ok: true, materializedResultBanId: banId };
    }

    const fromRevision = store.getState().revision ?? '0';
    const { delta } = buildRemoveDelta({
      itemId: effect.targetItemId,
      fromRevision,
    });
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      delta,
      promoteCausalNext: true,
      source: 'user',
    });
    return { ok: true };
  } catch {
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'OVERBOARD_SUBMIT_FAILED',
      source: 'user',
    });
    return { ok: false, error: 'OVERBOARD_SUBMIT_FAILED' };
  }
}
