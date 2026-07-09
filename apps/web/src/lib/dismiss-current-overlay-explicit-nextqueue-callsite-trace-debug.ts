'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type DismissCurrentOverlayExplicitNextQueueCallsiteTraceInput = {
  reason: string;
  nextQueue: QueuedOverlay[];
  caller: string;
  source: string;
  functionName: string;
  currentOverlayKind: string | null;
  currentOverlayId: string | null;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
};

export type DismissCurrentOverlayExplicitNextQueueCallsiteTrace = {
  timestamp: number;
  reason: string;
  nextQueueLength: number;
  nextQueueKinds: string[];
  nextQueueIds: string[];
  caller: string;
  source: string;
  functionName: string;
  currentOverlayKind: string | null;
  currentOverlayId: string | null;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  stack: string | null;
};

const emittedSigs = new Set<string>();

function nextQueueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function nextQueueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function captureStack(): string | null {
  try {
    return new Error('DISMISS_CURRENT_OVERLAY_EXPLICIT_NEXTQUEUE_CALLSITE_TRACE')
      .stack ?? null;
  } catch {
    return null;
  }
}

function stackCallsiteKey(stack: string | null): string {
  if (!stack) return 'no-stack';
  const lines = stack.split('\n').map((line) => line.trim());
  return lines.slice(1, 4).join('|') || 'empty-stack';
}

export function logDismissCurrentOverlayExplicitNextQueueCallsiteTrace(
  input: DismissCurrentOverlayExplicitNextQueueCallsiteTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const stack = captureStack();
  const sig = [
    input.reason,
    input.nextQueue.length,
    nextQueueKinds(input.nextQueue).join(','),
    stackCallsiteKey(stack),
  ].join('|');
  if (emittedSigs.has(sig)) return;
  emittedSigs.add(sig);

  const payload: DismissCurrentOverlayExplicitNextQueueCallsiteTrace = {
    timestamp: diagTraceNow(),
    reason: input.reason,
    nextQueueLength: input.nextQueue.length,
    nextQueueKinds: nextQueueKinds(input.nextQueue),
    nextQueueIds: nextQueueIds(input.nextQueue),
    caller: input.caller,
    source: input.source,
    functionName: input.functionName,
    currentOverlayKind: input.currentOverlayKind,
    currentOverlayId: input.currentOverlayId,
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    stack,
  };

  emitClientDiagTrace(
    'DISMISS_CURRENT_OVERLAY_EXPLICIT_NEXTQUEUE_CALLSITE_TRACE',
    payload,
  );
}
