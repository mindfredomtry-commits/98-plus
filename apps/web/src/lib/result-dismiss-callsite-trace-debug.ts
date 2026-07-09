'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ResultDismissCallsite =
  | 'dismissBanResult'
  | 'finalizeResultForGoToBans.queueOverboard'
  | 'finalizeResultForGoToBans.prune';

export type ResultDismissCallsiteTraceInput = {
  callsite: ResultDismissCallsite;
  reason: string;
  nextQueue: QueuedOverlay[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  resultBanId: string | null;
  previousHeadKind: string | null;
  previousHeadId: string | null;
};

export type ResultDismissCallsiteTrace = {
  timestamp: number;
  callsite: ResultDismissCallsite;
  reason: string;
  nextQueueLength: number;
  nextQueueKinds: string[];
  nextQueueIds: string[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  resultBanId: string | null;
  previousHeadKind: string | null;
  previousHeadId: string | null;
};

function nextQueueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function nextQueueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

export function logResultDismissCallsiteTrace(
  input: ResultDismissCallsiteTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const payload: ResultDismissCallsiteTrace = {
    timestamp: diagTraceNow(),
    callsite: input.callsite,
    reason: input.reason,
    nextQueueLength: input.nextQueue.length,
    nextQueueKinds: nextQueueKinds(input.nextQueue),
    nextQueueIds: nextQueueIds(input.nextQueue),
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    resultBanId: input.resultBanId,
    previousHeadKind: input.previousHeadKind,
    previousHeadId: input.previousHeadId,
  };

  emitClientDiagTrace('RESULT_DISMISS_CALLSITE_TRACE', payload);
}
