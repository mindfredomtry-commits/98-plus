'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type FinalizeResultGoToBansQueueStage =
  | 'entry'
  | 'before-remove-overlays-for-ban'
  | 'after-remove-overlays-for-ban'
  | 'before-prune'
  | 'before-dismiss';

export type FinalizeResultGoToBansQueueTraceInput = {
  stage: FinalizeResultGoToBansQueueStage;
  resultBanId: string;
  reason?: string | null;
  branch?: string | null;
  beforeQueue?: QueuedOverlay[];
  afterRemoveQueue?: QueuedOverlay[];
  nextQueue?: QueuedOverlay[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  includeStack?: boolean;
};

export type FinalizeResultGoToBansQueueTrace = {
  timestamp: number;
  stage: FinalizeResultGoToBansQueueStage;
  resultBanId: string;
  reason: string | null;
  branch: string | null;
  beforeQueueLength: number;
  beforeQueueKinds: string[];
  beforeQueueIds: string[];
  afterRemoveQueueLength: number | null;
  afterRemoveQueueKinds: string[];
  afterRemoveQueueIds: string[];
  nextQueueLength: number | null;
  nextQueueKinds: string[];
  nextQueueIds: string[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  stack: string | null;
};

function queueKinds(queue: QueuedOverlay[] | undefined): string[] {
  return queue?.map((item) => item.kind) ?? [];
}

function queueIds(queue: QueuedOverlay[] | undefined): string[] {
  return (
    queue
      ?.map((item) => queueHeadIdFrom(item))
      .filter((id): id is string => id != null) ?? []
  );
}

function captureStack(): string | null {
  try {
    return new Error('FINALIZE_RESULT_GO_TO_BANS_QUEUE_TRACE').stack ?? null;
  } catch {
    return null;
  }
}

export function logFinalizeResultGoToBansQueueTrace(
  input: FinalizeResultGoToBansQueueTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const beforeQueue = input.beforeQueue ?? [];
  const payload: FinalizeResultGoToBansQueueTrace = {
    timestamp: diagTraceNow(),
    stage: input.stage,
    resultBanId: input.resultBanId,
    reason: input.reason ?? null,
    branch: input.branch ?? null,
    beforeQueueLength: beforeQueue.length,
    beforeQueueKinds: queueKinds(beforeQueue),
    beforeQueueIds: queueIds(beforeQueue),
    afterRemoveQueueLength: input.afterRemoveQueue?.length ?? null,
    afterRemoveQueueKinds: queueKinds(input.afterRemoveQueue),
    afterRemoveQueueIds: queueIds(input.afterRemoveQueue),
    nextQueueLength: input.nextQueue?.length ?? null,
    nextQueueKinds: queueKinds(input.nextQueue),
    nextQueueIds: queueIds(input.nextQueue),
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    stack: input.includeStack ? captureStack() : null,
  };

  emitClientDiagTrace('FINALIZE_RESULT_GO_TO_BANS_QUEUE_TRACE', payload);
}
