/**
 * Vertical 3 — check action command + SUBMIT_CARD_ACTION effect execution.
 * UI never calls the ban check API directly.
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
import type {
  NotificationItem,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';
import { projectRuntimeQueueToLegacy } from './notification-runtime.adapters';
import type { OwnerActiveDisplayPatch } from '@/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '@/lib/overlay-queue';

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

export type CheckActionLegacySinks = {
  writeQueue: (queue: QueuedOverlay[], source: string) => void;
  writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
  /** TEMP V5: schedule poll; must only later dispatch runtime events. */
  scheduleResultPoll?: (banId: string) => void;
  /** TEMP: fetch result when done without payload. */
  fetchResult?: (banId: string) => Promise<BanResult | null>;
};

function banIdFromCheckItemId(itemId: string): string {
  return itemId.startsWith('check:') ? itemId.slice('check:'.length) : itemId;
}

function projectRuntimeAfterAction(
  store: NotificationRuntimeStore,
  sinks: CheckActionLegacySinks,
  source: string,
): void {
  const state = store.getState();
  sinks.writeQueue(
    projectRuntimeQueueToLegacy(state),
    `v3-check-action:${source}`,
  );
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(state),
    `v3-check-action-display:${source}`,
  );
}

/**
 * First-click entry: create commandId + CARD_ACTION_REQUESTED only.
 * Returns SUBMIT effects to run (exactly 0 or 1).
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
 * Never dismisses / clears display before HTTP completes.
 */
export async function executeSubmitCardActionEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }>,
  transport: CheckSubmitTransport,
  token: string,
  sinks: CheckActionLegacySinks,
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
      projectRuntimeAfterAction(store, sinks, 'success-result');
      return;
    }

    if (res.done) {
      let fetched: BanResult | null = null;
      if (sinks.fetchResult) {
        try {
          fetched = await sinks.fetchResult(banId);
        } catch {
          fetched = null;
        }
      }
      if (fetched) {
        store.dispatch({
          type: 'CARD_ACTION_SUCCEEDED',
          commandId: effect.commandId,
          targetItemId: effect.targetItemId,
          replacement: { kind: 'result', result: fetched },
          source: 'user',
        });
        projectRuntimeAfterAction(store, sinks, 'success-fetched-result');
        return;
      }
      // done without result yet — keep check, mark succeeded, TEMP poll
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        source: 'user',
      });
      projectRuntimeAfterAction(store, sinks, 'success-done-waiting-result');
      sinks.scheduleResultPoll?.(banId);
      return;
    }

    if (res.waiting) {
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: effect.commandId,
        targetItemId: effect.targetItemId,
        source: 'user',
      });
      projectRuntimeAfterAction(store, sinks, 'success-waiting-partner');
      sinks.scheduleResultPoll?.(banId);
      return;
    }

    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: effect.commandId,
      targetItemId: effect.targetItemId,
      errorCode: 'CHECK_SUBMIT_UNKNOWN',
      source: 'user',
    });
    projectRuntimeAfterAction(store, sinks, 'failed-unknown');
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
    projectRuntimeAfterAction(store, sinks, 'failed-transport');
  }
}

/**
 * TEMP poll/WS: apply result into runtime when waiting succeeded.
 * Must not dismiss/clear independently of reducer.
 */
export function applyPolledCheckResultToRuntime(
  store: NotificationRuntimeStore,
  banId: string,
  result: BanResult,
  sinks: CheckActionLegacySinks,
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
  projectRuntimeAfterAction(store, sinks, 'poll-result');
  return true;
}
