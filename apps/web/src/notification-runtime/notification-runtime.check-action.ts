/**
 * Vertical 3 — check action command + SUBMIT_CARD_ACTION effect execution.
 * Stage 7 Phase 1: no legacy sinks.
 */
import type { BanResult } from '@98plus/shared';
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
  NotificationItem,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type CheckSubmitApiResponse = {
  done: boolean;
  waiting?: boolean;
  result?: BanResult;
};

export type CheckSubmitTransport = (input: {
  banId: string;
  completed: boolean;
  token: string;
}) => Promise<CheckSubmitApiResponse>;

function banIdFromCheckItemId(itemId: string): string {
  return itemId.startsWith('check:') ? itemId.slice('check:'.length) : itemId;
}

/**
 * First-click entry: create commandId + CARD_ACTION_REQUESTED only.
 */
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
  if (selectIsActionBlocked(store.getState())) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'action-blocked',
    };
  }
  const current = selectCurrentItem(store.getState());
  if (!current || current.kind !== 'check') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'current-not-check',
    };
  }
  const targetItemId = notificationItemId(current);
  if (normalizeId(current.ban.id) !== normalizeId(args.banId)) {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'ban-mismatch',
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

/**
 * Execute SUBMIT_CARD_ACTION — sole production API caller for check answer.
 */
export async function executeSubmitCardActionEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: CheckSubmitTransport,
  token: string,
): Promise<void> {
  if (effect.action !== 'check_answer') return;
  const banId = banIdFromCheckItemId(effect.targetItemId);
  try {
    const res = await transport({
      banId,
      completed: Boolean(effect.completed),
      token,
    });

    if (res.result) {
      const replacement: NotificationItem = {
        kind: 'result',
        result: res.result,
      };
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        replacement,
        source: 'user',
      });
      return;
    }

    if (res.done || res.waiting) {
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
      errorCode: 'CHECK_SUBMIT_UNKNOWN',
      source: 'user',
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'CHECK_SUBMIT_FAILED';
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: message,
      source: 'user',
    });
  }
}

/**
 * Apply result into runtime when waiting succeeded.
 */
export function applyPolledCheckResultToRuntime(
  store: NotificationRuntimeStore,
  banId: string,
  result: BanResult,
): boolean {
  const state = store.getState();
  const targetItemId = `check:${normalizeId(banId)}`;
  if (
    state.action.status !== 'succeeded' ||
    state.action.targetItemId !== targetItemId ||
    !state.action.commandId
  ) {
    return false;
  }
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: state.action.commandId,
    targetItemId,
    replacement: { kind: 'result', result },
    source: 'poll',
  });
  return true;
}
