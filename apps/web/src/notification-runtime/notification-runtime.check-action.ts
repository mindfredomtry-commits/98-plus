/**
 * Stage 8 correction — check action targets activeItemId.
 * Cannot invent REMOVE/UPSERT revision; awaits Phase 9 truthful delta.
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
import {
  applyNotificationsDeltaToStore,
  parseNotificationsDeltaV1,
} from './notifications-mapper';

export type CheckSubmitApiResponse = {
  done: boolean;
  waiting?: boolean;
  result?: import('@98plus/shared').BanResult;
  notifications?: import('@98plus/shared').NotificationsDeltaV1 | null;
};

export type CheckSubmitTransport = (input: {
  banId: string;
  completed: boolean;
  token: string;
}) => Promise<CheckSubmitApiResponse>;

function banIdFromCheckItemId(itemId: string): string {
  return itemId.startsWith('check:') ? itemId.slice('check:'.length) : itemId;
}

export function requestCheckCardAction(
  store: NotificationRuntimeStore,
  args: {
    banId: string;
    completed: boolean;
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
  if (!active || active.kind !== 'check') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'active-not-check',
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
  const commandId = args.commandId ?? nextRuntimeTransitionId('check-action');
  const result = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId,
    targetItemId,
    action: 'check_answer',
    completed: args.completed,
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

export async function executeSubmitCardActionEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: CheckSubmitTransport,
  token: string,
  _userId: string,
): Promise<void> {
  if (effect.action !== 'check_answer') return;
  const banId = banIdFromCheckItemId(effect.targetItemId);
  try {
    const res = await transport({
      banId,
      completed: Boolean(effect.completed),
      token,
    });

    const delta = parseNotificationsDeltaV1(res.notifications ?? null);
    if (delta) {
      applyNotificationsDeltaToStore(store, {
        delta,
        transitionId: effect.commandId,
        activeRemoveAuthorization: {
          actionId: effect.commandId,
          itemId: effect.targetItemId,
        },
        promoteCausalNext: true,
        source: 'user',
      });
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        source: 'user',
      });
      return;
    }

    // Waiting without journal ops: clear SUBMITTING only (partner still answering).
    if (res.waiting || (res.done && !res.result)) {
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
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
  } catch {
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'CHECK_SUBMIT_FAILED',
      source: 'user',
    });
  }
}
