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
 *
 * Early-result buffer: if a matching WS result arrives in the narrow window
 * before beginInteractiveCardActionChain is visible, park it here (bounded TTL).
 * Opening the chain claims and stages it. Never a second display queue.
 */
import type { BanResult } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import {
  buildActionMatchingResultTraceFields,
  logActionCompletionReleasedWithoutResult,
  logActionEarlyResultClaimed,
  logActionEarlyResultParked,
  logActionMatchingResultDeduped,
  logActionMatchingResultMaterialized,
  logActionMatchingResultStaged,
  logActionResultChainOpened,
  logActionResultReconciliationStarted,
  logActionResultWaitStarted,
  logActionResultWaitTimeout,
  type ActionMatchingResultSource,
  type ActionResultRuntimeSnapshot,
} from '@/lib/action-matching-result-handoff-debug';
import type {
  CardActionType,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

export type { ActionMatchingResultSource, ActionResultRuntimeSnapshot };

/**
 * Dedupe window after materialization: the second transport (WS or HTTP) for the
 * same ban must be recognised as a duplicate instead of opening a second card.
 */
export const ACTION_RESULT_DEDUPE_TTL_MS = 30_000;

/** Bounded wait for an expected matching WS result after HTTP success. */
export const ACTION_RESULT_WAIT_TIMEOUT_MS = 10_000;

/** Poll interval while waiting for a staged matching result. */
export const ACTION_RESULT_WAIT_POLL_MS = 25;

/** Early-result park TTL — only covers the registration race. */
export const ACTION_EARLY_RESULT_TTL_MS = 2_000;

/** Hard cap on parked early results (never a second queue). */
export const ACTION_EARLY_RESULT_MAX = 8;

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
  /** When the executor began waiting for an expected async result. */
  waitStartedAt: number | null;
};

type EarlyParkedResult = {
  banId: string;
  result: BanResult;
  source: ActionMatchingResultSource;
  parkedAt: number;
};

const chains = new Map<string, InteractiveCardActionChain>();
const earlyParked = new Map<string, EarlyParkedResult>();

/** Test-only override for the expected-result wait timeout. */
let waitTimeoutMsForTest: number | null = null;

function now(): number {
  return Date.now();
}

function purgeExpired(at: number): void {
  for (const [banId, chain] of chains) {
    if (
      chain.settledAt != null &&
      at - chain.settledAt > ACTION_RESULT_DEDUPE_TTL_MS
    ) {
      chains.delete(banId);
    }
  }
  for (const [banId, parked] of earlyParked) {
    if (at - parked.parkedAt > ACTION_EARLY_RESULT_TTL_MS) {
      earlyParked.delete(banId);
    }
  }
}

function trimEarlyParked(at: number): void {
  purgeExpired(at);
  if (earlyParked.size <= ACTION_EARLY_RESULT_MAX) return;
  const ordered = [...earlyParked.entries()].sort(
    (a, b) => a[1].parkedAt - b[1].parkedAt,
  );
  while (ordered.length > ACTION_EARLY_RESULT_MAX) {
    const oldest = ordered.shift();
    if (oldest) earlyParked.delete(oldest[0]);
  }
}

export function snapshotRuntimeForActionResultHandoff(
  state: NotificationRuntimeState,
): ActionResultRuntimeSnapshot {
  return {
    lifecycle: state.syncStatus,
    displayKind: null,
    displayId: null,
    queueLength: state.passiveItemIds.length + (state.activeItemId ? 1 : 0),
    activeItemId: state.activeItemId,
  };
}

/** Correlation key — ban id is also the result id across this product. */
export function actionResultCorrelationKey(id: string | null | undefined): string {
  return normalizeId(id ?? '');
}

export function getActionResultWaitTimeoutMs(): number {
  return waitTimeoutMsForTest ?? ACTION_RESULT_WAIT_TIMEOUT_MS;
}

export function setActionResultWaitTimeoutMsForTest(ms: number | null): void {
  waitTimeoutMsForTest = ms;
}

function parkEarlyActionResult(args: {
  banId: string;
  result: BanResult;
  source: ActionMatchingResultSource;
  runtime?: ActionResultRuntimeSnapshot | null;
}): { parked: true; reason: string } {
  const banId = args.banId;
  const at = now();
  trimEarlyParked(at);
  earlyParked.set(banId, {
    banId,
    result: args.result,
    source: args.source,
    parkedAt: at,
  });
  logActionEarlyResultParked(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: null,
      source: args.source,
      runtime: args.runtime ?? null,
      stagedResultId: normalizeId(args.result.id) || banId,
      reason: 'ws-before-action-chain',
      elapsedMs: 0,
    }),
  );
  return { parked: true, reason: 'ws-before-action-chain' };
}

function claimEarlyParkedResult(banId: string): EarlyParkedResult | null {
  const at = now();
  purgeExpired(at);
  const parked = earlyParked.get(banId) ?? null;
  if (!parked) return null;
  earlyParked.delete(banId);
  return parked;
}

export function beginInteractiveCardActionChain(args: {
  banId: string;
  actionTransactionId: string;
  action: CardActionType;
  runtime?: ActionResultRuntimeSnapshot | null;
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
    waitStartedAt: null,
  };
  chains.set(banId, chain);
  logActionResultChainOpened(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: null,
      runtime: args.runtime ?? null,
      reason: 'interactive-card-action-opened',
      elapsedMs: 0,
    }),
  );

  // Claim any matching result that raced ahead of registration.
  const parked = claimEarlyParkedResult(banId);
  if (parked) {
    chain.stagedResult = parked.result;
    chain.stagedSource = parked.source;
    const elapsedMs = Math.max(0, at - parked.parkedAt);
    logActionEarlyResultClaimed(
      buildActionMatchingResultTraceFields({
        banId,
        actionTransactionId: args.actionTransactionId,
        source: parked.source,
        runtime: args.runtime ?? null,
        stagedResultId: normalizeId(parked.result.id) || banId,
        reason: 'claimed-on-chain-open',
        elapsedMs,
      }),
    );
    logActionMatchingResultStaged(
      buildActionMatchingResultTraceFields({
        banId,
        actionTransactionId: args.actionTransactionId,
        source: parked.source,
        runtime: args.runtime ?? null,
        stagedResultId: normalizeId(parked.result.id) || banId,
        reason: 'staged-from-early-park',
        elapsedMs,
      }),
    );
  }
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
  | 'parked'
  | 'not-correlated';

export type StageMatchingActionResultDecision = {
  outcome: StageMatchingActionResultOutcome;
  actionTransactionId: string | null;
  reason: string;
};

/**
 * Claim a WS/HTTP result for the current action chain.
 * First result wins; later transports for the same chain dedupe.
 *
 * When no chain is open yet but `allowEarlyPark` is true (active incoming head
 * for this ban), park in the early-result buffer for claim on chain open.
 */
export function stageMatchingActionResult(args: {
  banId: string;
  result: BanResult;
  source: ActionMatchingResultSource;
  runtime?: ActionResultRuntimeSnapshot | null;
  /**
   * Permit early park when the active incoming card matches this ban and the
   * action transaction has not registered yet. Never parks unrelated live results.
   */
  allowEarlyPark?: boolean;
}): StageMatchingActionResultDecision {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  const runtime = args.runtime ?? null;
  if (!chain) {
    if (args.allowEarlyPark && banId) {
      parkEarlyActionResult({
        banId,
        result: args.result,
        source: args.source,
        runtime,
      });
      return {
        outcome: 'parked',
        actionTransactionId: null,
        reason: 'ws-before-action-chain',
      };
    }
    return {
      outcome: 'not-correlated',
      actionTransactionId: null,
      reason: 'no-action-chain',
    };
  }
  if (chain.status === 'released-without-result') {
    return {
      outcome: 'not-correlated',
      actionTransactionId: chain.actionTransactionId,
      reason: 'chain-released-without-result',
    };
  }
  if (chain.status === 'materialized' || chain.stagedResult != null) {
    logActionMatchingResultDeduped(
      buildActionMatchingResultTraceFields({
        banId,
        actionTransactionId: chain.actionTransactionId,
        source: args.source,
        runtime,
        stagedResultId: normalizeId(args.result.id) || banId,
        reason:
          chain.status === 'materialized'
            ? 'already-materialized'
            : `already-staged-from-${chain.stagedSource ?? 'unknown'}`,
        elapsedMs:
          chain.waitStartedAt != null
            ? Math.max(0, now() - chain.waitStartedAt)
            : Math.max(0, now() - chain.startedAt),
      }),
    );
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
  logActionMatchingResultStaged(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: chain.actionTransactionId,
      source: args.source,
      runtime,
      stagedResultId: normalizeId(args.result.id) || banId,
      reason: 'staged-for-action-completion',
      elapsedMs: Math.max(0, now() - chain.startedAt),
    }),
  );
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

/**
 * Wait until a matching result is staged for this in-flight chain, or timeout.
 * Keeps the action/runtime presentation claim — never advances to idle.
 */
export async function waitForMatchingActionResult(args: {
  banId: string;
  actionTransactionId: string;
  timeoutMs?: number;
  pollMs?: number;
  runtime?: ActionResultRuntimeSnapshot | null;
}): Promise<TakeStagedActionResult | null> {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  if (!chain || chain.actionTransactionId !== args.actionTransactionId) {
    return null;
  }
  if (chain.status !== 'in-flight') return null;

  const timeoutMs = args.timeoutMs ?? getActionResultWaitTimeoutMs();
  const pollMs = args.pollMs ?? ACTION_RESULT_WAIT_POLL_MS;
  const startedAt = now();
  chain.waitStartedAt = startedAt;
  logActionResultWaitStarted(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: null,
      runtime: args.runtime ?? null,
      reason: 'awaiting-expected-matching-result',
      elapsedMs: 0,
    }),
  );

  // Immediate take if already staged (early park / WS-before-HTTP).
  const immediate = takeStagedActionResult({
    banId,
    actionTransactionId: args.actionTransactionId,
    before: args.runtime,
  });
  if (immediate) return immediate;

  while (now() - startedAt < timeoutMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    const still = banId ? (chains.get(banId) ?? null) : null;
    if (
      !still ||
      still.actionTransactionId !== args.actionTransactionId ||
      still.status !== 'in-flight'
    ) {
      return null;
    }
    const taken = takeStagedActionResult({
      banId,
      actionTransactionId: args.actionTransactionId,
      before: args.runtime,
    });
    if (taken) return taken;
  }

  const elapsedMs = Math.max(0, now() - startedAt);
  logActionResultWaitTimeout(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: null,
      runtime: args.runtime ?? null,
      reason: 'expected-result-wait-timeout',
      elapsedMs,
    }),
  );
  logActionResultReconciliationStarted(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: null,
      runtime: args.runtime ?? null,
      reason: 'recoverable-action-failure-after-result-wait',
      elapsedMs,
    }),
  );
  return null;
}

/** Emitted after the runtime replacement so before/after are both truthful. */
export function noteStagedActionResultMaterialized(args: {
  banId: string;
  actionTransactionId: string;
  source: ActionMatchingResultSource;
  before: ActionResultRuntimeSnapshot | null;
  after: ActionResultRuntimeSnapshot | null;
}): void {
  const banId = actionResultCorrelationKey(args.banId);
  const chain = banId ? (chains.get(banId) ?? null) : null;
  logActionMatchingResultMaterialized(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: args.source,
      before: args.before,
      after: args.after,
      stagedResultId: args.after?.displayId ?? banId,
      reason: 'atomic-replacement-materialized',
      elapsedMs:
        chain?.startedAt != null ? Math.max(0, now() - chain.startedAt) : null,
    }),
  );
}

/**
 * The action contract explicitly required no result: the chain releases and
 * normal advance/Lobby behaviour applies.
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
  logActionCompletionReleasedWithoutResult(
    buildActionMatchingResultTraceFields({
      banId,
      actionTransactionId: args.actionTransactionId,
      source: null,
      before: args.before,
      after: args.after,
      reason: args.reason,
      elapsedMs:
        chain?.startedAt != null ? Math.max(0, now() - chain.startedAt) : null,
    }),
  );
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
  earlyParked.delete(banId);
}

export function resetInteractiveCardActionResultHandoffForTest(): void {
  chains.clear();
  earlyParked.clear();
  waitTimeoutMsForTest = null;
}

/** Test helper — inspect early park buffer without claiming. */
export function getEarlyParkedActionResultForTest(
  banId: string,
): EarlyParkedResult | null {
  purgeExpired(now());
  return earlyParked.get(actionResultCorrelationKey(banId)) ?? null;
}
