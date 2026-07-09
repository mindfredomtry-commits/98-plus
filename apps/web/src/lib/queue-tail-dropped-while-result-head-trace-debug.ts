'use client';

import {
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueTailDroppedWhileResultHeadTraceInput = {
  beforeQueue: QueuedOverlay[];
  afterQueue: QueuedOverlay[];
  beforePending?: QueuedOverlay[];
  afterPending?: QueuedOverlay[];
  operation: string;
  source: string;
  reason: string;
  calledFrom?: string | null;
};

export type QueueTailDroppedWhileResultHeadEnrichment = {
  overlayQueueRefBefore?: QueuedOverlay[];
  overlayQueueRefAfter?: QueuedOverlay[];
  overlayQueueStateBefore?: QueuedOverlay[];
  overlayQueueStateAfter?: QueuedOverlay[];
  activeNotificationChain?: boolean | null;
  explicitDrainReason?: string | null;
  drainSessionId?: string | number | null;
  queueClaimsNotificationScreen?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  notificationChainTransitioning?: boolean | null;
  currentHeadKind?: string | null;
  currentHeadId?: string | null;
};

type QueueTailDroppedWhileResultHeadHooks = {
  captureBefore: () => void;
  readEnrichment: () => QueueTailDroppedWhileResultHeadEnrichment;
};

let hooks: QueueTailDroppedWhileResultHeadHooks | null = null;
let lastTraceSignature = '';
let lastTraceAt = 0;

export function registerQueueTailDroppedWhileResultHeadHooks(
  next: QueueTailDroppedWhileResultHeadHooks | null,
): void {
  hooks = next;
}

export function captureQueueTailDroppedWhileResultHeadBefore(): void {
  hooks?.captureBefore();
}

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function queueKeys(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => overlayQueueKey(item));
}

function matchesTailDropWhileResultHead(
  beforeQueue: QueuedOverlay[],
  afterQueue: QueuedOverlay[],
): QueuedOverlay[] | null {
  if (beforeQueue.length <= 1) return null;
  if (afterQueue.length !== 1) return null;
  if (beforeQueue[0]?.kind !== 'result') return null;
  if (afterQueue[0]?.kind !== 'result') return null;

  const droppedTail = beforeQueue.slice(1).filter((item) => {
    const key = overlayQueueKey(item);
    return !afterQueue.some((afterItem) => overlayQueueKey(afterItem) === key);
  });
  if (droppedTail.length === 0) return null;
  return droppedTail;
}

function captureQueueTailDroppedWhileResultHeadStack(): string {
  try {
    return new Error('QUEUE_TAIL_DROPPED_WHILE_RESULT_HEAD_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function traceQueueTailDroppedWhileResultHeadIfNeeded(
  input: QueueTailDroppedWhileResultHeadTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const droppedTail = matchesTailDropWhileResultHead(
    input.beforeQueue,
    input.afterQueue,
  );
  if (!droppedTail) return;

  const beforeKinds = queueKinds(input.beforeQueue);
  const afterKinds = queueKinds(input.afterQueue);
  const signature = [
    input.operation,
    input.source,
    input.reason,
    beforeKinds.join(','),
    afterKinds.join(','),
  ].join('|');
  const now = diagTraceNow();
  if (signature === lastTraceSignature && now - lastTraceAt < 25) {
    return;
  }
  lastTraceSignature = signature;
  lastTraceAt = now;

  const enrichment = hooks?.readEnrichment() ?? {};
  const beforePending = input.beforePending ?? [];
  const afterPending = input.afterPending ?? [];
  const currentHead = input.afterQueue[0] ?? null;

  const payload = {
    timestamp: now,
    operation: input.operation,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom ?? input.source,
    stack: captureQueueTailDroppedWhileResultHeadStack(),
    activeNotificationChain: enrichment.activeNotificationChain ?? null,
    explicitDrainReason: enrichment.explicitDrainReason ?? null,
    drainSessionId: enrichment.drainSessionId ?? null,
    queueClaimsNotificationScreen:
      enrichment.queueClaimsNotificationScreen ?? null,
    visualQueueDimSessionLive: enrichment.visualQueueDimSessionLive ?? null,
    notificationChainTransitioning:
      enrichment.notificationChainTransitioning ?? null,
    currentHeadKind:
      enrichment.currentHeadKind ??
      currentHead?.kind ??
      null,
    currentHeadId:
      enrichment.currentHeadId ??
      (currentHead ? queueHeadIdFrom(currentHead) : null),
    beforeQueueLen: input.beforeQueue.length,
    beforeQueueKinds: beforeKinds,
    beforeQueueIds: queueIds(input.beforeQueue),
    beforeQueueKeys: queueKeys(input.beforeQueue),
    afterQueueLen: input.afterQueue.length,
    afterQueueKinds: afterKinds,
    afterQueueIds: queueIds(input.afterQueue),
    afterQueueKeys: queueKeys(input.afterQueue),
    droppedTailLen: droppedTail.length,
    droppedTailKinds: queueKinds(droppedTail),
    droppedTailIds: queueIds(droppedTail),
    droppedTailKeys: queueKeys(droppedTail),
    beforeOwnerPendingLen: beforePending.length,
    beforeOwnerPendingKinds: queueKinds(beforePending),
    beforeOwnerPendingIds: queueIds(beforePending),
    afterOwnerPendingLen: afterPending.length,
    afterOwnerPendingKinds: queueKinds(afterPending),
    afterOwnerPendingIds: queueIds(afterPending),
    beforeOverlayQueueRefLen: enrichment.overlayQueueRefBefore?.length ?? null,
    beforeOverlayQueueRefKinds: enrichment.overlayQueueRefBefore
      ? queueKinds(enrichment.overlayQueueRefBefore)
      : [],
    beforeOverlayQueueRefIds: enrichment.overlayQueueRefBefore
      ? queueIds(enrichment.overlayQueueRefBefore)
      : [],
    afterOverlayQueueRefLen: enrichment.overlayQueueRefAfter?.length ?? null,
    afterOverlayQueueRefKinds: enrichment.overlayQueueRefAfter
      ? queueKinds(enrichment.overlayQueueRefAfter)
      : [],
    afterOverlayQueueRefIds: enrichment.overlayQueueRefAfter
      ? queueIds(enrichment.overlayQueueRefAfter)
      : [],
    beforeOverlayQueueStateLen:
      enrichment.overlayQueueStateBefore?.length ?? null,
    beforeOverlayQueueStateKinds: enrichment.overlayQueueStateBefore
      ? queueKinds(enrichment.overlayQueueStateBefore)
      : [],
    beforeOverlayQueueStateIds: enrichment.overlayQueueStateBefore
      ? queueIds(enrichment.overlayQueueStateBefore)
      : [],
    afterOverlayQueueStateLen: enrichment.overlayQueueStateAfter?.length ?? null,
    afterOverlayQueueStateKinds: enrichment.overlayQueueStateAfter
      ? queueKinds(enrichment.overlayQueueStateAfter)
      : [],
    afterOverlayQueueStateIds: enrichment.overlayQueueStateAfter
      ? queueIds(enrichment.overlayQueueStateAfter)
      : [],
  };

  emitClientDiagTrace('QUEUE_TAIL_DROPPED_WHILE_RESULT_HEAD_TRACE', payload);
}
