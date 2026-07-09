'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type PostResultGoToBansQueueStateTraceInput = {
  resultBanId: string;
  beforeOwnerQueue: QueuedOverlay[];
  beforeOverlayQueueState: QueuedOverlay[];
  beforeOverlayQueueRef: QueuedOverlay[];
  afterOwnerQueue: QueuedOverlay[];
  afterOwnerPending: QueuedOverlay[];
  afterOverlayQueueState: QueuedOverlay[];
  afterOverlayQueueRef: QueuedOverlay[];
};

export type PostResultGoToBansQueueStateTrace = {
  timestamp: number;
  resultBanId: string;
  beforeOwnerQueueLen: number;
  beforeOwnerQueueKinds: string[];
  beforeOwnerQueueIds: string[];
  beforeOverlayQueueStateLength: number;
  beforeOverlayQueueStateKinds: string[];
  beforeOverlayQueueRefLength: number;
  beforeOverlayQueueRefKinds: string[];
  afterOwnerQueueLen: number;
  afterOwnerQueueKinds: string[];
  afterOwnerQueueIds: string[];
  afterOwnerPendingLen: number;
  afterOwnerPendingKinds: string[];
  afterOverlayQueueStateLength: number;
  afterOverlayQueueStateKinds: string[];
  afterOverlayQueueRefLength: number;
  afterOverlayQueueRefKinds: string[];
  removedResultOnlyExpected: boolean;
  expectedRemainingKinds: string[];
  actualRemainingKinds: string[];
  queueDroppedUnexpectedly: boolean;
  stack: string;
};

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function kindsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((kind, index) => kind === b[index]);
}

function computeExpectedRemainingQueue(
  beforeOwnerQueue: QueuedOverlay[],
  resultBanId: string,
): QueuedOverlay[] {
  const norm = normalizeId(resultBanId);
  return beforeOwnerQueue.filter(
    (item) => normalizeId(overlayBanId(item)) !== norm,
  );
}

function capturePostResultGoToBansQueueStateStack(): string {
  try {
    return new Error('POST_RESULT_GO_TO_BANS_QUEUE_STATE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function logPostResultGoToBansQueueStateTrace(
  input: PostResultGoToBansQueueStateTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const expectedRemaining = computeExpectedRemainingQueue(
    input.beforeOwnerQueue,
    input.resultBanId,
  );
  const expectedRemainingKinds = queueKinds(expectedRemaining);
  const actualRemainingKinds = queueKinds(input.afterOwnerQueue);
  const removedResultOnlyExpected = kindsEqual(
    expectedRemainingKinds,
    actualRemainingKinds,
  );
  const queueDroppedUnexpectedly =
    expectedRemaining.length > 0 && input.afterOwnerQueue.length === 0;

  const payload: PostResultGoToBansQueueStateTrace = {
    timestamp: diagTraceNow(),
    resultBanId: input.resultBanId,
    beforeOwnerQueueLen: input.beforeOwnerQueue.length,
    beforeOwnerQueueKinds: queueKinds(input.beforeOwnerQueue),
    beforeOwnerQueueIds: queueIds(input.beforeOwnerQueue),
    beforeOverlayQueueStateLength: input.beforeOverlayQueueState.length,
    beforeOverlayQueueStateKinds: queueKinds(input.beforeOverlayQueueState),
    beforeOverlayQueueRefLength: input.beforeOverlayQueueRef.length,
    beforeOverlayQueueRefKinds: queueKinds(input.beforeOverlayQueueRef),
    afterOwnerQueueLen: input.afterOwnerQueue.length,
    afterOwnerQueueKinds: actualRemainingKinds,
    afterOwnerQueueIds: queueIds(input.afterOwnerQueue),
    afterOwnerPendingLen: input.afterOwnerPending.length,
    afterOwnerPendingKinds: queueKinds(input.afterOwnerPending),
    afterOverlayQueueStateLength: input.afterOverlayQueueState.length,
    afterOverlayQueueStateKinds: queueKinds(input.afterOverlayQueueState),
    afterOverlayQueueRefLength: input.afterOverlayQueueRef.length,
    afterOverlayQueueRefKinds: queueKinds(input.afterOverlayQueueRef),
    removedResultOnlyExpected,
    expectedRemainingKinds,
    actualRemainingKinds,
    queueDroppedUnexpectedly,
    stack: capturePostResultGoToBansQueueStateStack(),
  };

  emitClientDiagTrace('POST_RESULT_GO_TO_BANS_QUEUE_STATE_TRACE', payload);
}
