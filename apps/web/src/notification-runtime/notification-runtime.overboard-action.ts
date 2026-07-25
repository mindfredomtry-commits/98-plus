/**
 * Vertical V2 — incoming overboard as runtime CARD_ACTION.
 * Host must not clear display/queue; runtime owns submit → advance.
 */
import type { BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import {
  buildExclusiveDisplayPatchFromRuntime,
} from './notification-runtime.production-advance';
import {
  selectCurrentItem,
  selectIsActionBlocked,
} from './notification-runtime.selectors';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  explainIncomingOverboardCompletion,
  getIncomingOverboardCompletionSnapshot,
  noteIncomingOverboardCompletion,
} from './notification-runtime.overboard-completion';
import {
  armOverboardV3WriterWatch,
  beginOverboardV3ProdTrace,
  logOverboardV3ProdTrace,
  snapshotRuntimeForOverboardV3Trace,
} from '@/lib/overboard-v3-prod-trace';
import type {
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';
import { projectRuntimeQueueToLegacy } from './notification-runtime.adapters';
import type { OwnerActiveDisplayPatch } from '@/lib/notification-overlay-owner';
import type { QueuedOverlay } from '@/lib/overlay-queue';

export type OverboardSubmitApiResponse = {
  ok?: boolean;
  result?: BanResult | null;
  error?: string;
};

export type OverboardSubmitTransport = (input: {
  banId: string;
  token: string;
}) => Promise<OverboardSubmitApiResponse>;

export type OverboardActionLegacySinks = {
  writeQueue: (queue: QueuedOverlay[], source: string) => void;
  writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
};

function banIdFromIncomingItemId(itemId: string): string {
  return itemId.startsWith('incoming:')
    ? itemId.slice('incoming:'.length)
    : itemId;
}

function projectRuntimeAfterOverboard(
  store: NotificationRuntimeStore,
  sinks: OverboardActionLegacySinks,
  source: string,
): void {
  const state = store.getState();
  sinks.writeQueue(
    projectRuntimeQueueToLegacy(state),
    `v2-overboard-action:${source}`,
  );
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(state),
    `v2-overboard-action-display:${source}`,
  );
}

/**
 * First click: CARD_ACTION_REQUESTED(incoming_overboard) only.
 * Does not clear display or mutate queue.
 */
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
  const current = selectCurrentItem(store.getState());
  if (!current || current.kind !== 'incoming') {
    return {
      accepted: false,
      commandId: null,
      effects: [],
      reason: 'current-not-incoming',
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
  const commandId =
    args.commandId ?? nextRuntimeTransitionId('overboard-action');
  beginOverboardV3ProdTrace(commandId);
  const beforeRequest = store.getState();
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
  logOverboardV3ProdTrace('CARD_ACTION_REQUESTED', {
    commandId,
    targetItemId,
    banId: args.banId,
    accepted: submitEffects.length > 0,
    reason: submitEffects.length > 0 ? null : 'reducer-rejected',
    before: snapshotRuntimeForOverboardV3Trace(beforeRequest),
    after: snapshotRuntimeForOverboardV3Trace(store.getState()),
  });
  return {
    accepted: submitEffects.length > 0,
    commandId: submitEffects.length > 0 ? commandId : null,
    effects: result.effects,
    reason: submitEffects.length > 0 ? undefined : 'reducer-rejected',
  };
}

/**
 * Execute SUBMIT_CARD_ACTION for incoming_overboard.
 * On success: consume head + advance to next / idle (no host display write).
 * On failure: restore showing on same head; queue preserved.
 */
export async function executeSubmitIncomingOverboardEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: OverboardSubmitTransport,
  token: string,
  sinks: OverboardActionLegacySinks,
): Promise<{ ok: boolean; error?: string }> {
  if (effect.action !== 'incoming_overboard') {
    return { ok: false, error: 'wrong-action' };
  }
  const banId = banIdFromIncomingItemId(effect.targetItemId);
  logOverboardV3ProdTrace('SUBMIT_CARD_ACTION_START', {
    commandId: effect.commandId,
    targetItemId: effect.targetItemId,
    banId,
    before: snapshotRuntimeForOverboardV3Trace(store.getState()),
  });
  try {
    const res = await transport({ banId, token });
    if (res.ok === false || res.error) {
      store.dispatch({
        type: 'CARD_ACTION_FAILED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        errorCode: res.error ?? 'OVERBOARD_SUBMIT_FAILED',
        source: 'user',
      });
      projectRuntimeAfterOverboard(store, sinks, 'failed-api');
      logOverboardV3ProdTrace('SUBMIT_CARD_ACTION_RESULT', {
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        banId,
        ok: false,
        error: res.error ?? 'OVERBOARD_SUBMIT_FAILED',
        after: snapshotRuntimeForOverboardV3Trace(store.getState()),
      });
      return { ok: false, error: res.error ?? 'Ошибка перебора' };
    }

    // Chain drain: consume incoming and show next / idle.
    // Result payload is not inserted as a blocking head (queue of N incomings).
    const beforeSucceeded = store.getState();
    logOverboardV3ProdTrace('STATE_BEFORE_SUCCESS', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      before: snapshotRuntimeForOverboardV3Trace(beforeSucceeded),
    });
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      consumeAndAdvance: true,
      source: 'user',
    });
    const afterSucceeded = store.getState();
    logOverboardV3ProdTrace('CARD_ACTION_SUCCEEDED', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      consumeAndAdvance: true,
    });
    logOverboardV3ProdTrace('STATE_AFTER_SUCCESS', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      after: snapshotRuntimeForOverboardV3Trace(afterSucceeded),
    });
    projectRuntimeAfterOverboard(store, sinks, 'success-advance');
    // V3: publish the chain-ended edge so hosts can drop obsolete UI state.
    const eligibility = explainIncomingOverboardCompletion(
      beforeSucceeded,
      afterSucceeded,
      {
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
      },
    );
    logOverboardV3ProdTrace('COMPLETION_ELIGIBILITY', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      checks: eligibility.checks,
    });
    const emitted = noteIncomingOverboardCompletion(
      beforeSucceeded,
      afterSucceeded,
      {
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
      },
    );
    const completion = getIncomingOverboardCompletionSnapshot();
    logOverboardV3ProdTrace('COMPLETION_EDGE', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      emitted,
      seq: completion.seq,
      completionCommandId: completion.commandId,
      rejectionReason: emitted ? null : eligibility.reason,
    });
    logOverboardV3ProdTrace('SUBMIT_CARD_ACTION_RESULT', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      ok: true,
      after: snapshotRuntimeForOverboardV3Trace(afterSucceeded),
      completionEmitted: emitted,
      completionSeq: completion.seq,
    });
    if (emitted) {
      armOverboardV3WriterWatch({
        commandId: effect.commandId,
        seq: completion.seq,
        reason: 'completion-edge-emitted',
      });
    }
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'OVERBOARD_SUBMIT_FAILED';
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: message,
      source: 'user',
    });
    projectRuntimeAfterOverboard(store, sinks, 'failed-transport');
    logOverboardV3ProdTrace('SUBMIT_CARD_ACTION_RESULT', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      ok: false,
      error: message,
      after: snapshotRuntimeForOverboardV3Trace(store.getState()),
    });
    return { ok: false, error: message };
  }
}
