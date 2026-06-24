'use client';

import { normalizeId } from '@/lib/normalize-json';
import {
  buildResultPriorityQueue,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { snapshotQueueHead } from '@/lib/chain-head-switch-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type QueueHeadBecameResultTraceContext = {
  source: string;
  reason: string;
  mountedIncomingBanId?: string | null;
  heldKind?: string | null;
  heldBanId?: string | null;
  pendingLen?: number;
  resultPriorityBanIds?: string[];
  stack?: readonly string[];
};

const FORCE_LOG_REASONS = new Set([
  'apply-overlay-queue-enter-result-head',
  'apply-overlay-queue-commit',
  'result-priority-ban-id-added',
  'result-priority-reorder-commit',
  'collect-pending-notification-chain-after-merge',
  'open-next-after-queue-handoff-merge',
  'show-next-flush-sync-merge-startup',
]);

export function traceQueueHeadBecameResultIfNeeded(
  prevQueue: readonly QueuedOverlay[],
  nextQueue: readonly QueuedOverlay[],
  ctx: QueueHeadBecameResultTraceContext,
): void {
  const prevHead = snapshotQueueHead(prevQueue[0]);
  const nextHead = snapshotQueueHead(nextQueue[0]);
  if (!nextHead || nextHead.kind !== 'result') return;

  const becameResult = prevHead?.kind !== 'result';
  const resultMovedToHead =
    prevHead?.kind !== 'result' ||
    normalizeId(prevHead.banId) !== normalizeId(nextHead.banId);

  if (
    !FORCE_LOG_REASONS.has(ctx.reason) &&
    !becameResult &&
    !resultMovedToHead
  ) {
    return;
  }

  const stack = [...(ctx.stack ?? [])];
  const callerStack = [...stack, ctx.reason].join(' > ');

  emit('[QUEUE HEAD BECAME RESULT TRACE]', {
    source: ctx.source,
    reason: ctx.reason,
    resultBanId: nextHead.banId,
    previousHeadKind: prevHead?.kind ?? null,
    previousHeadBanId: prevHead?.banId ?? null,
    newHeadKind: nextHead.kind,
    newHeadBanId: nextHead.banId,
    mountedIncomingBanId: normalizeId(ctx.mountedIncomingBanId ?? '') || null,
    heldKind: ctx.heldKind ?? null,
    heldBanId: ctx.heldBanId ? normalizeId(ctx.heldBanId) : null,
    queueLen: nextQueue.length,
    pendingLen: ctx.pendingLen ?? 0,
    resultPriorityBanIds: ctx.resultPriorityBanIds ?? [],
    stack,
    callerStack,
    becameResult,
    resultMovedToHead,
    headUnchangedButResult:
      prevHead?.kind === 'result' &&
      normalizeId(prevHead.banId) === normalizeId(nextHead.banId),
  });
}

export function traceResultPriorityBanIdInfluence(
  addedBanId: string,
  currentQueue: readonly QueuedOverlay[],
  ctx: QueueHeadBecameResultTraceContext,
): void {
  const norm = normalizeId(addedBanId);
  if (!norm) return;

  const headBefore = snapshotQueueHead(currentQueue[0]);
  const resultItem = currentQueue.find(
    (q) => q.kind === 'result' && normalizeId(q.result.id) === norm,
  );

  let projectedHead = headBefore;
  if (resultItem) {
    const projected = buildResultPriorityQueue(
      [...currentQueue],
      norm,
      resultItem,
    );
    projectedHead = snapshotQueueHead(projected[0]);
  }

  const stack = [...(ctx.stack ?? [])];
  const callerStack = [...stack, 'result-priority-ban-id-added'].join(' > ');

  emit('[QUEUE HEAD BECAME RESULT TRACE]', {
    source: ctx.source,
    reason: 'result-priority-ban-id-added',
    resultBanId: norm,
    previousHeadKind: headBefore?.kind ?? null,
    previousHeadBanId: headBefore?.banId ?? null,
    newHeadKind: projectedHead?.kind ?? headBefore?.kind ?? null,
    newHeadBanId: projectedHead?.banId ?? headBefore?.banId ?? null,
    mountedIncomingBanId: normalizeId(ctx.mountedIncomingBanId ?? '') || null,
    heldKind: ctx.heldKind ?? null,
    heldBanId: ctx.heldBanId ? normalizeId(ctx.heldBanId) : null,
    queueLen: currentQueue.length,
    pendingLen: ctx.pendingLen ?? 0,
    resultPriorityBanIds: ctx.resultPriorityBanIds ?? [],
    stack,
    callerStack,
    becameResult: headBefore?.kind !== 'result',
    resultMovedToHead:
      projectedHead?.kind === 'result' &&
      (headBefore?.kind !== 'result' ||
        normalizeId(headBefore.banId) !== normalizeId(projectedHead.banId)),
    wouldReorderToHead:
      projectedHead?.kind === 'result' &&
      normalizeId(projectedHead.banId) === norm,
    resultItemInQueue: Boolean(resultItem),
  });
}
