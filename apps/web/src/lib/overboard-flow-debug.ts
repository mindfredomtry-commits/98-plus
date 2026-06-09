export type OverboardFlowLogStage =
  | 'click'
  | 'api-request'
  | 'api-response'
  | 'api-error'
  | 'result-open-immediate'
  | 'result-fetch-after-action'
  | 'fallback-to-lobby';

export function logOverboardFlow(
  stage: OverboardFlowLogStage,
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[OVERBOARD FLOW]', stage, data ?? {});
}
