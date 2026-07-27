/**
 * Vertical V2 — incoming overboard as runtime CARD_ACTION.
 * Host must not clear display/queue; runtime owns submit → advance.
 *
 * FIX B: for result-producing overboard actions, never consume the incoming
 * head into idle until a matching result is atomically installed as the
 * replacement head (or the server explicitly proves no result is expected,
 * or the action fails / wait times out into a recoverable failure).
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
  abandonInteractiveCardActionChain,
  beginInteractiveCardActionChain,
  noteStagedActionResultMaterialized,
  releaseInteractiveCardActionChainWithoutResult,
  snapshotRuntimeForActionResultHandoff,
  stageMatchingActionResult,
  takeStagedActionResult,
  waitForMatchingActionResult,
  type ActionMatchingResultSource,
} from './notification-runtime.action-result-handoff';
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
import type { OwnerActiveDisplayPatch } from '@/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '@/lib/overlay-queue';

export type OverboardSubmitApiResponse = {
  ok?: boolean;
  result?: BanResult | null;
  error?: string;
  /**
   * Explicit no-result contract. Absence of `result` alone is NOT proof —
   * production overboard often delivers the matching result over WS after HTTP.
   * Only set this when the server proves no result card is expected.
   */
  explicitNoResult?: boolean;
};

export type OverboardSubmitTransport = (input: {
  banId: string;
  token: string;
}) => Promise<OverboardSubmitApiResponse>;

export type OverboardSubmitOutcome = {
  ok: boolean;
  error?: string;
  /**
   * FIX B: set when a result matching this action became the runtime head.
   * Hosts must not neutralize / mark-delivered that result — the runtime owns it.
   */
  materializedResultBanId?: string | null;
  matchingResultSource?: ActionMatchingResultSource | null;
};

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
 * Opens the correlation transaction BEFORE any network can race a WS result.
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
  // FIX B: open the correlation window before the request can race a WS result.
  beginInteractiveCardActionChain({
    banId: args.banId,
    actionTransactionId: commandId,
    action: 'incoming_overboard',
    runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
  });
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
  if (submitEffects.length === 0) {
    abandonInteractiveCardActionChain({
      banId: args.banId,
      actionTransactionId: commandId,
    });
  }
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

function materializeMatchingReplacement(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  banId: string,
  matching: {
    result: BanResult;
    source: ActionMatchingResultSource;
    actionTransactionId: string;
  },
  handoffBefore: ReturnType<typeof snapshotRuntimeForActionResultHandoff>,
  sinks: OverboardActionLegacySinks,
): OverboardSubmitOutcome {
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: effect.commandId,
    targetItemId: effect.targetItemId,
    replacement: { kind: 'result', result: matching.result },
    source: 'user',
  });
  noteStagedActionResultMaterialized({
    banId,
    actionTransactionId: matching.actionTransactionId,
    source: matching.source,
    before: handoffBefore,
    after: snapshotRuntimeForActionResultHandoff(store.getState()),
  });
  const afterSucceeded = store.getState();
  logOverboardV3ProdTrace('CARD_ACTION_SUCCEEDED', {
    commandId: effect.commandId,
    targetItemId: effect.targetItemId,
    banId,
    consumeAndAdvance: false,
    materializedMatchingResult: true,
    matchingResultSource: matching.source,
  });
  logOverboardV3ProdTrace('STATE_AFTER_SUCCESS', {
    commandId: effect.commandId,
    targetItemId: effect.targetItemId,
    banId,
    after: snapshotRuntimeForOverboardV3Trace(afterSucceeded),
  });
  projectRuntimeAfterOverboard(store, sinks, 'success-replacement');
  return {
    ok: true,
    materializedResultBanId: banId,
    matchingResultSource: matching.source,
  };
}

function publishOverboardCompletion(
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  banId: string,
  beforeState: ReturnType<NotificationRuntimeStore['getState']>,
  afterState: ReturnType<NotificationRuntimeStore['getState']>,
): void {
  const eligibility = explainIncomingOverboardCompletion(
    beforeState,
    afterState,
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
  const emitted = noteIncomingOverboardCompletion(beforeState, afterState, {
    commandId: effect.commandId,
    targetItemId: effect.targetItemId,
  });
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
    after: snapshotRuntimeForOverboardV3Trace(afterState),
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
}

/**
 * Execute SUBMIT_CARD_ACTION for incoming_overboard.
 * On matching result: atomic incoming → result replacement (no idle gap).
 * On explicit no-result: consume head + advance to next / idle.
 * On expected-result wait timeout / failure: restore showing on same head.
 */
export async function executeSubmitIncomingOverboardEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: OverboardSubmitTransport,
  token: string,
  sinks: OverboardActionLegacySinks,
): Promise<OverboardSubmitOutcome> {
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
      // FIX B: failed action never materializes a success result; incoming stays.
      abandonInteractiveCardActionChain({
        banId,
        actionTransactionId: effect.commandId,
      });
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

    const beforeSucceeded = store.getState();
    logOverboardV3ProdTrace('STATE_BEFORE_SUCCESS', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      before: snapshotRuntimeForOverboardV3Trace(beforeSucceeded),
    });

    // FIX B: a result matching this action belongs to the action chain.
    // The HTTP response is staged through the same registry as WS, so whichever
    // transport arrives first wins and the other one dedupes.
    const handoffBefore = snapshotRuntimeForActionResultHandoff(beforeSucceeded);
    if (res.result) {
      stageMatchingActionResult({
        banId,
        result: res.result,
        source: 'http',
        runtime: handoffBefore,
      });
    }
    let matching = takeStagedActionResult({
      banId,
      actionTransactionId: effect.commandId,
      before: handoffBefore,
    });

    // Expected-result contract: absence of an inline HTTP result is NOT proof
    // that no result is coming — wait for a matching WS (or late stage).
    if (!matching && !res.explicitNoResult) {
      matching = await waitForMatchingActionResult({
        banId,
        actionTransactionId: effect.commandId,
        runtime: handoffBefore,
      });
    }

    if (matching) {
      const outcome = materializeMatchingReplacement(
        store,
        effect,
        banId,
        matching,
        handoffBefore,
        sinks,
      );
      publishOverboardCompletion(
        effect,
        banId,
        beforeSucceeded,
        store.getState(),
      );
      return outcome;
    }

    if (res.explicitNoResult) {
      // Explicit no-result contract — existing consume-and-advance completion.
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        consumeAndAdvance: true,
        source: 'user',
      });
      releaseInteractiveCardActionChainWithoutResult({
        banId,
        actionTransactionId: effect.commandId,
        reason: 'explicit-no-result-contract',
        before: handoffBefore,
        after: snapshotRuntimeForActionResultHandoff(store.getState()),
      });
      const afterSucceeded = store.getState();
      logOverboardV3ProdTrace('CARD_ACTION_SUCCEEDED', {
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        banId,
        consumeAndAdvance: true,
        materializedMatchingResult: false,
        matchingResultSource: null,
      });
      logOverboardV3ProdTrace('STATE_AFTER_SUCCESS', {
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        banId,
        after: snapshotRuntimeForOverboardV3Trace(afterSucceeded),
      });
      projectRuntimeAfterOverboard(store, sinks, 'success-advance');
      publishOverboardCompletion(
        effect,
        banId,
        beforeSucceeded,
        afterSucceeded,
      );
      return {
        ok: true,
        materializedResultBanId: null,
        matchingResultSource: null,
      };
    }

    // Expected-result wait timed out — recoverable failure, keep incoming.
    // Never silently advance to idle / expose Lobby orb/logo-only.
    abandonInteractiveCardActionChain({
      banId,
      actionTransactionId: effect.commandId,
    });
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'ACTION_RESULT_WAIT_TIMEOUT',
      source: 'user',
    });
    projectRuntimeAfterOverboard(store, sinks, 'result-wait-timeout');
    logOverboardV3ProdTrace('SUBMIT_CARD_ACTION_RESULT', {
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      banId,
      ok: false,
      error: 'ACTION_RESULT_WAIT_TIMEOUT',
      after: snapshotRuntimeForOverboardV3Trace(store.getState()),
    });
    return { ok: false, error: 'ACTION_RESULT_WAIT_TIMEOUT' };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'OVERBOARD_SUBMIT_FAILED';
    abandonInteractiveCardActionChain({
      banId,
      actionTransactionId: effect.commandId,
    });
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
