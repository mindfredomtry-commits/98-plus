'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type FinalizeResultGoToBansBetweenEntryAndPruneTraceInput = {
  stage: string;
  resultBanId: string;
  operation: string;
  queue: QueuedOverlay[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  activeBanId: string | null;
  firstZeroStack?: string | null;
};

export type FinalizeResultGoToBansBetweenEntryAndPruneTrace = {
  timestamp: number;
  stage: string;
  resultBanId: string;
  operation: string;
  queueLength: number;
  queueKinds: string[];
  queueIds: string[];
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  activeBanId: string | null;
  stack: string | null;
};

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

export function captureFinalizeBetweenEntryAndPruneFirstZeroStack(): string {
  try {
    return (
      new Error('FINALIZE_RESULT_GO_TO_BANS_BETWEEN_ENTRY_AND_PRUNE_TRACE')
        .stack ?? ''
    );
  } catch {
    return '';
  }
}

export function logFinalizeResultGoToBansBetweenEntryAndPruneTrace(
  input: FinalizeResultGoToBansBetweenEntryAndPruneTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const payload: FinalizeResultGoToBansBetweenEntryAndPruneTrace = {
    timestamp: diagTraceNow(),
    stage: input.stage,
    resultBanId: input.resultBanId,
    operation: input.operation,
    queueLength: input.queue.length,
    queueKinds: queueKinds(input.queue),
    queueIds: queueIds(input.queue),
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    activeKind: input.activeKind,
    activeBanId: input.activeBanId,
    stack: input.firstZeroStack ?? null,
  };

  emitClientDiagTrace(
    'FINALIZE_RESULT_GO_TO_BANS_BETWEEN_ENTRY_AND_PRUNE_TRACE',
    payload,
  );
}
