'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type FinalizeResultQueueFirstZeroTraceInput = {
  previousStage: string;
  currentStage: string;
  previousQueue: QueuedOverlay[];
  currentQueue: QueuedOverlay[];
  operation: string;
  resultBanId: string;
  activeKind: string | null;
  activeBanId: string | null;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
};

export type FinalizeResultQueueFirstZeroTrace = {
  timestamp: number;
  previousStage: string;
  currentStage: string;
  previousQueueLength: number;
  previousQueueKinds: string[];
  previousQueueIds: string[];
  currentQueueLength: number;
  currentQueueKinds: string[];
  currentQueueIds: string[];
  operation: string;
  resultBanId: string;
  activeKind: string | null;
  activeBanId: string | null;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
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

function captureFirstZeroStack(): string {
  try {
    return new Error('FINALIZE_RESULT_QUEUE_FIRST_ZERO_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function logFinalizeResultQueueFirstZeroTrace(
  input: FinalizeResultQueueFirstZeroTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const payload: FinalizeResultQueueFirstZeroTrace = {
    timestamp: diagTraceNow(),
    previousStage: input.previousStage,
    currentStage: input.currentStage,
    previousQueueLength: input.previousQueue.length,
    previousQueueKinds: queueKinds(input.previousQueue),
    previousQueueIds: queueIds(input.previousQueue),
    currentQueueLength: input.currentQueue.length,
    currentQueueKinds: queueKinds(input.currentQueue),
    currentQueueIds: queueIds(input.currentQueue),
    operation: input.operation,
    resultBanId: input.resultBanId,
    activeKind: input.activeKind,
    activeBanId: input.activeBanId,
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    stack: captureFirstZeroStack(),
  };

  emitClientDiagTrace('FINALIZE_RESULT_QUEUE_FIRST_ZERO_TRACE', payload);
}
