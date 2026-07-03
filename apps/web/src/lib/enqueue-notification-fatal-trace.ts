export type EnqueueNotificationFatalTracePayload = {
  source: string;
  notificationKind: string | null;
  banId: string | null;
  resultId: string | null;
  stage: string;
  errorName: string | null;
  errorMessage: string | null;
  stack: string | null;
  reachedAfterEntry: boolean;
  reachedBeforeFirstReturn: boolean;
  reachedBeforeApply: boolean;
};

export function logEnqueueNotificationFatalTrace(
  payload: EnqueueNotificationFatalTracePayload,
): void {
  console.log('ENQUEUE_NOTIFICATION_FATAL_TRACE', payload);
}
