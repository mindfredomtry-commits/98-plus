'use client';

export const ACTION_MATCHING_RESULT_STAGED = 'ACTION_MATCHING_RESULT_STAGED';
export const ACTION_MATCHING_RESULT_MATERIALIZED =
  'ACTION_MATCHING_RESULT_MATERIALIZED';
export const ACTION_MATCHING_RESULT_DEDUPED = 'ACTION_MATCHING_RESULT_DEDUPED';
export const ACTION_COMPLETION_RELEASED_WITHOUT_RESULT =
  'ACTION_COMPLETION_RELEASED_WITHOUT_RESULT';

export type ActionMatchingResultSource = 'ws' | 'http';

export type ActionResultRuntimeSnapshot = {
  lifecycle: string;
  displayKind: string | null;
  displayId: string | null;
  queueLength: number;
};

export type ActionMatchingResultTraceFields = {
  banId: string;
  actionTransactionId: string | null;
  source: ActionMatchingResultSource | null;
  before: ActionResultRuntimeSnapshot | null;
  after: ActionResultRuntimeSnapshot | null;
  reason?: string;
};

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { t: Date.now(), ...data };
  console.log(event, payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, payload);
  }
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

export function logActionCompletionReleasedWithoutResult(
  fields: ActionMatchingResultTraceFields,
): void {
  emit(ACTION_COMPLETION_RELEASED_WITHOUT_RESULT, fields);
}
