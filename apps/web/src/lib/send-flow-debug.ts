export type SendFlowLogStage =
  | 'hold-start'
  | 'api-request'
  | 'api-response'
  | 'api-error'
  | 'insufficient-energy-stop'
  | 'insufficient-energy-redirect-to-lobby'
  | 'suppress-confirm-error-for-low-energy'
  | 'lobby-hint-shown'
  | 'blocked-late-success'
  | 'open-success'
  | 'await-api-success';

export function logSendFlow(
  stage: SendFlowLogStage,
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[SEND FLOW]', stage, data ?? {});
}
