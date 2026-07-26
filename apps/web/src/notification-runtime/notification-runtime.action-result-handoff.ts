/**
 * FIX B — matching interactive card action result handoff.
 *
 * Proven production failure (success-prod-trace5):
 *   incoming cms1vmwok… → submit overboard → matching result for the SAME ban
 *   arrives over WS → classified `LIVE OVERLAY BLOCKED reason=normal-mode`
 *   → deferred to pending → HTTP 200 CARD_ACTION_SUCCEEDED consumed the head
 *   with `consumeAndAdvance` → runtime idle + queue empty → Lobby orb painted.
 *   The result the user acted for was never materialized.
 *
 * Invariant: a result matching an in-flight (or just-completed) interactive card
 * action belongs to that action chain, not to normal-mode live-overlay handling.
 *
 * This module is the correlation registry only. It never dispatches, never
 * selects a head and never mutates the queue — the action executor asks it for
 * the matching result and performs one atomic CARD_ACTION_SUCCEEDED replacement.
 */
import type { BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import {
  logActionCompletionReleasedWithoutResult,
  logActionMatchingResultDeduped,
  logActionMatchingResultMaterialized,
  logActionMatchingResultStaged,
  type ActionMatchingResultSource,
  type ActionResultRuntimeSnapshot,
} from '@/lib/action-matching-result-handoff-debug';
import type {
  CardActionType,
  NotificationRuntimeState,
} from './notification-runtime.types';

export type { ActionMatchingResultSource, ActionResultRuntimeSnapshot };

/**
 * Dedupe window after materialization: the second transport (WS or HTTP) for the
 * same ban must be recognised as a duplicate instead of opening a second card.
 */
export const ACTION_RESULT_DEDUPE_TTL_MS = 30_000;

export type InteractiveCardActionChainStatus =
  | 'in-flight'
  | 'materialized'
  | 'released-without-result';

export type InteractiveCardActionChain = {
  banId: string;
  actionTransactionId: string;
  action: CardActionType;
  status: InteractiveCardActionChainStatus;
  stagedResult: BanResult | null;
  stagedSource: ActionMatchingResultSource | null;
  startedAt: number;
  settledAt: number | null;
};

const chains = new Map<string, InteractiveCardActionChain>();

function now(): number {
  return Date.now();
}

function purgeExpired(at: number): void {
  for (const [banId, chain] of chains) {
    if (chain.settledAt != null && at - chain.settledAt > ACTION_RESULT_DEDUPE_TTL_MS) {
      chains.delete(banId);
    }
  }
}

export function snapshotRuntimeForActionResultHandoff(
  state: NotificationRuntimeState,
): ActionResultRuntimeSnapshot {
  const payload = state.display.payload;
  const displayId =
    payload == null
      ? null
      : payload.kind === 'result'
        ? normalizeId(payload.result.id)
        : normalizeId(payload.ban.id);
  return {
    lifecycle: state.lifecycle.status,
    displayKind: state.display.kind,
    displayId: displayId || null,
    queueLength: state.items.queue.length,
  };
}

/** Correlation key — ban id is also the result id across this product. */
export function actionResultCorrelationKey(id: string | null | undefined): string {
  return normalizeId(id ?? '');
}

export function beginInteractiveCardActionChain(args: {
  banId: string;
  actionTransactionId: string;
  action: CardActionType;
}): InteractiveCardActionChain | null {
  const banId = actionResultCorrelationKey(args.banId);
  if (!banId || !args.actionTransactionId) return null;
  const at = now();
  purgeExpired(at);
  const chain: InteractiveCardActionChain = {
    banId,
    actionTransactionId: args.actionTransactionId,
    action: args.action,
    status: 'in-flight',
    stagedResult: null,
    stagedSource: null,
    startedAt: at,
    settledAt: null,
  };
  chains.set(banId, chain);
  return chain;
}

export function getInteractiveCardActionChain(
  banId: string,
): InteractiveCardActionChain | null {
  const key = actionResultCorrelationKey(banId);
  if (!key) return null;
  purgeExpired(now());
  return chains.get(key) ?? null;
}

/**
 * True when a result for this ban must be handled as part of the action chain
 * (in flight, or already materialized inside the dedupe window).
 */
export function isInteractiveCardActionChainBan(banId: string): boolean {
  const chain = getInteractiveCardActionChain(banId);
  if (!chain) return false;
  return chain.status === 'in-flight' || chain.status === 'materialized';
}

export type StageMatchingActionResultOutcome =
  | 'staged'
  | 'deduped'
  | 'not-correlated';

export type StageMatchingActionResultDecision = {
  outcome: StageMatchingActionResultOutcome;
  actionTransactionId: string | null;
  reason: string;
};

/**
 * Claim a WS/HTTP result for the current action chain.
 * First result wins; later transports for the same chain dedupe.
 */
export function stageMatchingActionResult(args: {
  banId: string;
  result: BanResult;
  source: ActionMatchingResultSource;
  runtime?: ActionResultRuntimeSnapshot | null;
}): StageMatchingActionResultDecision {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  if (!chain) {
    return {
      outcome: 'not-correlated',
      actionTransactionId: null,
      reason: 'no-action-chain',
    };
  }
  const runtime = args.runtime ?? null;
  if (chain.status === 'released-without-result') {
    return {
      outcome: 'not-correlated',
      actionTransactionId: chain.actionTransactionId,
      reason: 'chain-released-without-result',
    };
  }
  if (chain.status === 'materialized' || chain.stagedResult != null) {
    logActionMatchingResultDeduped({
      banId,
      actionTransactionId: chain.actionTransactionId,
      source: args.source,
      before: runtime,
      after: runtime,
      reason:
        chain.status === 'materialized'
          ? 'already-materialized'
          : `already-staged-from-${chain.stagedSource ?? 'unknown'}`,
    });
    return {
      outcome: 'deduped',
      actionTransactionId: chain.actionTransactionId,
      reason:
        chain.status === 'materialized'
          ? 'already-materialized'
          : 'already-staged',
    };
  }
  chain.stagedResult = args.result;
  chain.stagedSource = args.source;
  logActionMatchingResultStaged({
    banId,
    actionTransactionId: chain.actionTransactionId,
    source: args.source,
    before: runtime,
    after: runtime,
  });
  return {
    outcome: 'staged',
    actionTransactionId: chain.actionTransactionId,
    reason: 'staged-for-action-completion',
  };
}

export type TakeStagedActionResult = {
  result: BanResult;
  source: ActionMatchingResultSource;
  actionTransactionId: string;
};

/**
 * Hand the staged result to the action completion exactly once.
 * The chain stays in the dedupe window so the other transport cannot re-open it.
 */
export function takeStagedActionResult(args: {
  banId: string;
  actionTransactionId: string;
  before?: ActionResultRuntimeSnapshot | null;
}): TakeStagedActionResult | null {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  if (!chain) return null;
  if (chain.actionTransactionId !== args.actionTransactionId) return null;
  if (chain.status !== 'in-flight') return null;
  const result = chain.stagedResult;
  const source = chain.stagedSource;
  if (!result || !source) return null;
  chain.status = 'materialized';
  chain.stagedResult = null;
  chain.settledAt = now();
  return { result, source, actionTransactionId: chain.actionTransactionId };
}

/** Emitted after the runtime replacement so before/after are both truthful. */
export function noteStagedActionResultMaterialized(args: {
  banId: string;
  actionTransactionId: string;
  source: ActionMatchingResultSource;
  before: ActionResultRuntimeSnapshot | null;
  after: ActionResultRuntimeSnapshot | null;
}): void {
  logActionMatchingResultMaterialized({
    banId: actionResultCorrelationKey(args.banId),
    actionTransactionId: args.actionTransactionId,
    source: args.source,
    before: args.before,
    after: args.after,
  });
}

/**
 * The action contract required no result (or none arrived): the chain releases
 * explicitly and normal advance/Lobby behaviour applies.
 */
export function releaseInteractiveCardActionChainWithoutResult(args: {
  banId: string;
  actionTransactionId: string;
  reason: string;
  before: ActionResultRuntimeSnapshot | null;
  after: ActionResultRuntimeSnapshot | null;
}): void {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  if (chain && chain.actionTransactionId === args.actionTransactionId) {
    chain.status = 'released-without-result';
    chain.stagedResult = null;
    chain.stagedSource = null;
    chain.settledAt = now();
  }
  logActionCompletionReleasedWithoutResult({
    banId,
    actionTransactionId: args.actionTransactionId,
    source: null,
    before: args.before,
    after: args.after,
    reason: args.reason,
  });
}

/**
 * Action failed: drop the chain so the incoming card is retained/restored and a
 * late matching result falls back to ordinary handling. Never materializes.
 */
export function abandonInteractiveCardActionChain(args: {
  banId: string;
  actionTransactionId: string;
}): void {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  if (!chain) return;
  if (chain.actionTransactionId !== args.actionTransactionId) return;
  chains.delete(banId);
}

export function resetInteractiveCardActionResultHandoffForTest(): void {
  chains.clear();
}
