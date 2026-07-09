'use client';

import {
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { snapshotQueueHead } from '@/lib/chain-head-switch-debug';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ResultBecameHeadQueueContextEnrichment = {
  overlayQueueState: QueuedOverlay[];
  ownerQueue: QueuedOverlay[];
  ownerPending: QueuedOverlay[];
  drainSessionId?: string | number | null;
  activeNotificationChain?: boolean;
  explicitDrainReason?: string | null;
  queueClaimsNotificationScreen?: boolean;
  visualQueueDimSessionLive?: boolean;
};

let enrichmentProvider: (() => ResultBecameHeadQueueContextEnrichment | null) | null =
  null;

let lastTraceSignature = '';
let lastTraceAt = 0;

export function registerResultBecameHeadQueueContextEnrichmentProvider(
  provider: (() => ResultBecameHeadQueueContextEnrichment | null) | null,
): void {
  enrichmentProvider = provider;
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

function resolveNextAfterResult(
  queue: QueuedOverlay[],
  resultBanId: string,
): {
  hasNextAfterResult: boolean;
  nextAfterResultKind: string | null;
  nextAfterResultId: string | null;
} {
  const norm = normalizeId(resultBanId);
  const resultIdx = queue.findIndex(
    (item) =>
      item.kind === 'result' && normalizeId(item.result.id) === norm,
  );
  const next =
    resultIdx >= 0 ? (queue[resultIdx + 1] ?? null) : (queue[1] ?? null);
  if (!next) {
    return {
      hasNextAfterResult: false,
      nextAfterResultKind: null,
      nextAfterResultId: null,
    };
  }
  return {
    hasNextAfterResult: true,
    nextAfterResultKind: next.kind,
    nextAfterResultId: queueHeadIdFrom(next),
  };
}

function captureResultBecameHeadQueueContextStack(): string {
  try {
    return new Error('RESULT_BECAME_HEAD_QUEUE_CONTEXT_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function traceResultBecameHeadQueueContextIfNeeded(
  prevQueue: readonly QueuedOverlay[],
  nextQueue: readonly QueuedOverlay[],
  source: string,
  reason: string,
  calledFromStack?: readonly string[],
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const prevHead = snapshotQueueHead(prevQueue[0]);
  const nextHead = snapshotQueueHead(nextQueue[0]);
  if (!nextHead || nextHead.kind !== 'result') return;

  const becameResult = prevHead?.kind !== 'result';
  const resultMovedToHead =
    prevHead?.kind !== 'result' ||
    normalizeId(prevHead.banId) !== normalizeId(nextHead.banId);
  if (!becameResult && !resultMovedToHead) return;

  const resultBanId = normalizeId(nextHead.banId);
  const signature = [
    resultBanId,
    prevHead?.kind ?? 'null',
    queueKinds([...nextQueue]).join(','),
    source,
    reason,
  ].join('|');
  const now = diagTraceNow();
  if (signature === lastTraceSignature && now - lastTraceAt < 25) {
    return;
  }
  lastTraceSignature = signature;
  lastTraceAt = now;

  const enrichment = enrichmentProvider?.();
  const ownerQueue = enrichment?.ownerQueue ?? [...nextQueue];
  const ownerPending = enrichment?.ownerPending ?? [];
  const overlayQueueState = enrichment?.overlayQueueState ?? [...nextQueue];
  const nextAfterOwner = resolveNextAfterResult(ownerQueue, resultBanId);
  const nextAfterRef = resolveNextAfterResult([...nextQueue], resultBanId);

  const payload = {
    timestamp: now,
    resultBanId,
    resultOverlayKey: `result:${resultBanId}`,
    previousHeadKind: prevHead?.kind ?? null,
    currentHeadKind: nextHead.kind,
    queueLen: ownerQueue.length,
    queueKinds: queueKinds(ownerQueue),
    queueIds: queueIds(ownerQueue),
    queueKeys: queueKeys(ownerQueue),
    pendingLen: ownerPending.length,
    pendingKinds: queueKinds(ownerPending),
    pendingIds: queueIds(ownerPending),
    refLen: nextQueue.length,
    refKinds: queueKinds([...nextQueue]),
    refIds: queueIds([...nextQueue]),
    stateLen: overlayQueueState.length,
    stateKinds: queueKinds(overlayQueueState),
    stateIds: queueIds(overlayQueueState),
    hasNextAfterResult:
      nextAfterOwner.hasNextAfterResult || nextAfterRef.hasNextAfterResult,
    nextAfterResultKind:
      nextAfterOwner.nextAfterResultKind ?? nextAfterRef.nextAfterResultKind,
    nextAfterResultId:
      nextAfterOwner.nextAfterResultId ?? nextAfterRef.nextAfterResultId,
    source,
    reason,
    calledFrom:
      calledFromStack && calledFromStack.length > 0
        ? calledFromStack.join(' > ')
        : reason,
    drainSessionId: enrichment?.drainSessionId ?? null,
    activeNotificationChain: enrichment?.activeNotificationChain ?? null,
    explicitDrainReason: enrichment?.explicitDrainReason ?? null,
    queueClaimsNotificationScreen:
      enrichment?.queueClaimsNotificationScreen ?? null,
    visualQueueDimSessionLive: enrichment?.visualQueueDimSessionLive ?? null,
    stack: captureResultBecameHeadQueueContextStack(),
  };

  emitClientDiagTrace('RESULT_BECAME_HEAD_QUEUE_CONTEXT_TRACE', payload);
}
