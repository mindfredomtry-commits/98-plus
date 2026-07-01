'use client';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ResultGoToBansConsumedQueueFilterStage =
  | 'mark-consumed'
  | 'filter-queue-before-sync'
  | 'filtered'
  | 'no-filter-needed'
  | 'sync-head-after-filter';

export type ResultGoToBansConsumedQueueFilterPayload = {
  stage: ResultGoToBansConsumedQueueFilterStage;
  consumedOverlayKey: string | null;
  consumedBanId: string | null;
  consumedResultId: string | null;
  queueLenBefore: number;
  queueLenAfter: number;
  removedCount: number;
  removedKinds: string[];
  headKindBefore: string | null;
  headBanIdBefore: string | null;
  headResultIdBefore: string | null;
  headKindAfter: string | null;
  headBanIdAfter: string | null;
  headResultIdAfter: string | null;
  activeKindBefore: string | null;
  activeKindAfter: string | null;
  reason: string;
  timestamp?: number;
};

export function logResultGoToBansConsumedQueueFilter(
  data: ResultGoToBansConsumedQueueFilterPayload,
): void {
  emit('RESULT_GO_TO_BANS_CONSUMED_QUEUE_FILTER', data);
}
