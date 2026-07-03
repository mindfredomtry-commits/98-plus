export type EnqueueNotificationExitTracePayload = {
  source: string;
  notificationKind: string | null;
  banId: string | null;
  resultId: string | null;
  changed: boolean | null;
  shouldDefer: boolean;
  willApplyOverlayQueue: boolean;
  returnReason: string;
  skipReason?: string | null;
  arbiterDecision?: string | null;
  dedupMatched?: boolean | null;
  resultBlocked?: boolean | null;
  passiveDeferred?: boolean | null;
  startupHold?: boolean | null;
  activeLock?: string | null;
  ttlSkip?: boolean | null;
};

export function logEnqueueNotificationExitTrace(
  payload: EnqueueNotificationExitTracePayload,
): void {
  console.log('ENQUEUE_NOTIFICATION_EXIT_TRACE', payload);
}
