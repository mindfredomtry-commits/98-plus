export type OverboardFlowLogStage =
  | 'real-button-click'
  | 'click'
  | 'submit-start'
  | 'api-request'
  | 'api-response'
  | 'api-response-raw'
  | 'api-error'
  | 'has-result'
  | 'receiverResult-call'
  | 'overlay-state-after-open'
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

/** Unconditional trace — confirms the real UI button fired. */
export function logOverboardButtonClick(
  banId: string,
  handler: string,
): void {
  console.log('[OVERBOARD FLOW] REAL BUTTON CLICK');
  console.log('[OVERBOARD FLOW] banId =', banId);
  console.log('[OVERBOARD FLOW] handler name =', handler);
}
