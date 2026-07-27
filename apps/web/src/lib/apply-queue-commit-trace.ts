import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';

export type ApplyQueueCommitTracePayload = {
  source: string;
  beforeQueueLength: number;
  afterQueueLength: number;
  dispatchExecuted: boolean;
  dispatchSkipped: boolean;
  finalizeCommitEntered: boolean;
  finalizeCommitReturned: boolean;
  queueApplyReturnedNull: boolean;
  queueApplyReturnedSameReference: boolean;
  queueChanged: boolean;
  queueIdentityChanged: boolean;
  reducerExecuted: boolean;
  reducerSkipped: boolean;
  reason: string;
  skipReason?: string | null;
};

export function queueOverlaySnapshotChanged(
  before: readonly QueuedOverlay[],
  after: readonly QueuedOverlay[],
): boolean {
  if (before.length !== after.length) return true;
  return before.some(
    (item, index) =>
      overlayQueueKey(item) !== overlayQueueKey(after[index]!),
  );
}

export function logApplyQueueCommitTrace(
  payload: ApplyQueueCommitTracePayload,
): void {
  console.log('APPLY_QUEUE_COMMIT_TRACE', payload);
}
