'use client';

export const ACTION_RESULT_CHAIN_OPENED = 'ACTION_RESULT_CHAIN_OPENED';
export const ACTION_EARLY_RESULT_PARKED = 'ACTION_EARLY_RESULT_PARKED';
export const ACTION_EARLY_RESULT_CLAIMED = 'ACTION_EARLY_RESULT_CLAIMED';
export const ACTION_MATCHING_RESULT_STAGED = 'ACTION_MATCHING_RESULT_STAGED';
export const ACTION_MATCHING_RESULT_MATERIALIZED =
  'ACTION_MATCHING_RESULT_MATERIALIZED';
export const ACTION_MATCHING_RESULT_DEDUPED = 'ACTION_MATCHING_RESULT_DEDUPED';
export const ACTION_RESULT_WAIT_STARTED = 'ACTION_RESULT_WAIT_STARTED';
export const ACTION_RESULT_WAIT_TIMEOUT = 'ACTION_RESULT_WAIT_TIMEOUT';
export const ACTION_RESULT_RECONCILIATION_STARTED =
  'ACTION_RESULT_RECONCILIATION_STARTED';
export const ACTION_COMPLETION_RELEASED_WITHOUT_RESULT =
  'ACTION_COMPLETION_RELEASED_WITHOUT_RESULT';

export type ActionMatchingResultSource = 'ws' | 'http';

export type ActionResultRuntimeSnapshot = {
  lifecycle: string;
  displayKind: string | null;
  displayId: string | null;
  queueLength: number;
  /** Active runtime head id (incoming:/check:/result:…). */
  activeItemId?: string | null;
};

export type ActionMatchingResultTraceFields = {
  banId: string;
  actionTransactionId: string | null;
  source: ActionMatchingResultSource | null;
  runtimeLifecycle: string | null;
  runtimeDisplayKind: string | null;
  activeRuntimeItemId: string | null;
  stagedResultId: string | null;
  dedupeKey: string | null;
  reason: string | null;
  elapsedMs: number | null;
  /** Optional before/after snapshots for richer traces. */
  before?: ActionResultRuntimeSnapshot | null;
  after?: ActionResultRuntimeSnapshot | null;
};

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { t: Date.now(), ...data };
  console.log(event, payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, payload);
  }
}

function runtimeFields(runtime: ActionResultRuntimeSnapshot | null | undefined) {
  return {
    runtimeLifecycle: runtime?.lifecycle ?? null,
    runtimeDisplayKind: runtime?.displayKind ?? null,
    activeRuntimeItemId: runtime?.activeItemId ?? runtime?.displayId ?? null,
  };
}

export function logActionResultChainOpened(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_RESULT_CHAIN_OPENED, fields);
}

export function logActionEarlyResultParked(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_EARLY_RESULT_PARKED, fields);
}

export function logActionEarlyResultClaimed(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_EARLY_RESULT_CLAIMED, fields);
}

export function logActionMatchingResultStaged(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_MATCHING_RESULT_STAGED, fields);
}

export function logActionMatchingResultMaterialized(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_MATCHING_RESULT_MATERIALIZED, fields);
}

export function logActionMatchingResultDeduped(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_MATCHING_RESULT_DEDUPED, fields);
}

export function logActionResultWaitStarted(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_RESULT_WAIT_STARTED, fields);
}

export function logActionResultWaitTimeout(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_RESULT_WAIT_TIMEOUT, fields);
}

export function logActionResultReconciliationStarted(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_RESULT_RECONCILIATION_STARTED, fields);
}

export function logActionCompletionReleasedWithoutResult(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_COMPLETION_RELEASED_WITHOUT_RESULT, fields);
}

/** Build a complete Fix B diagnostic payload from common inputs. */
export function buildActionMatchingResultTraceFields(input: {
  banId: string;
  actionTransactionId: string | null;
  source: ActionMatchingResultSource | null;
  runtime?: ActionResultRuntimeSnapshot | null;
  before?: ActionResultRuntimeSnapshot | null;
  after?: ActionResultRuntimeSnapshot | null;
  stagedResultId?: string | null;
  reason?: string | null;
  elapsedMs?: number | null;
}): ActionMatchingResultTraceFields {
  const runtime = input.runtime ?? input.after ?? input.before ?? null;
  return {
    banId: input.banId,
    actionTransactionId: input.actionTransactionId,
    source: input.source,
    ...runtimeFields(runtime),
    stagedResultId: input.stagedResultId ?? null,
    dedupeKey: input.banId || null,
    reason: input.reason ?? null,
    elapsedMs: input.elapsedMs ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  };
}
