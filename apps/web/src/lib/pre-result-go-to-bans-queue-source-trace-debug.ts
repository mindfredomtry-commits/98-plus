'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type PreResultGoToBansQueueSourceTraceInput = {
  resultBanId: string;
  activeKind: string | null;
  activeBanId: string | null;
  overlayQueueRef: QueuedOverlay[];
  overlayQueueState: QueuedOverlay[];
  ownerQueue: QueuedOverlay[];
  ownerPending: QueuedOverlay[];
  pendingChain: QueuedOverlay[];
  notificationChain: QueuedOverlay[];
  deferredQueue?: QueuedOverlay[];
  heldOverlayKind?: string | null;
  heldOverlayBanId?: string | null;
  displayCheckBanId?: string | null;
  displayIncomingBanId?: string | null;
  sourceFunction?: string;
};

export type PreResultGoToBansQueueSourceTrace = {
  timestamp: number;
  resultBanId: string;
  activeKind: string | null;
  activeBanId: string | null;
  overlayQueueRefLength: number;
  overlayQueueRefKinds: string[];
  overlayQueueRefIds: string[];
  overlayQueueStateLength: number;
  overlayQueueStateKinds: string[];
  overlayQueueStateIds: string[];
  ownerQueueLen: number;
  ownerQueueKinds: string[];
  ownerQueueIds: string[];
  ownerPendingLen: number;
  ownerPendingKinds: string[];
  ownerPendingIds: string[];
  pendingChainLength: number;
  pendingChainKinds: string[];
  notificationChainLength: number;
  notificationChainKinds: string[];
  nextCandidateKind: string | null;
  nextCandidateId: string | null;
  hasCheckCandidateAfterResult: boolean;
  hasIncomingCandidateAfterResult: boolean;
  sourceFunction: string;
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

function itemId(item: QueuedOverlay): string | null {
  return queueHeadIdFrom(item);
}

function sliceAfterResult(
  queue: QueuedOverlay[],
  resultBanId: string,
): QueuedOverlay[] {
  const norm = normalizeId(resultBanId);
  const resultIdx = queue.findIndex(
    (item) =>
      item.kind === 'result' && normalizeId(item.result.id) === norm,
  );
  if (resultIdx < 0) return queue;
  return queue.slice(resultIdx + 1);
}

function hasKindAfterResult(
  queue: QueuedOverlay[],
  resultBanId: string,
  kind: 'check' | 'incoming',
): boolean {
  return sliceAfterResult(queue, resultBanId).some((item) => item.kind === kind);
}

function findNextCandidate(
  queues: QueuedOverlay[][],
  resultBanId: string,
): { kind: string | null; id: string | null } {
  for (const queue of queues) {
    const afterResult = sliceAfterResult(queue, resultBanId);
    const candidate = afterResult.find(
      (item) => item.kind === 'check' || item.kind === 'incoming',
    );
    if (candidate) {
      return { kind: candidate.kind, id: itemId(candidate) };
    }
  }
  for (const queue of queues) {
    const candidate = queue.find(
      (item) => item.kind === 'check' || item.kind === 'incoming',
    );
    if (candidate) {
      return { kind: candidate.kind, id: itemId(candidate) };
    }
  }
  return { kind: null, id: null };
}

function capturePreResultGoToBansQueueSourceStack(): string {
  try {
    return new Error('PRE_RESULT_GO_TO_BANS_QUEUE_SOURCE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function logPreResultGoToBansQueueSourceTrace(
  input: PreResultGoToBansQueueSourceTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const deferredQueue = input.deferredQueue ?? [];
  const searchQueues = [
    input.ownerQueue,
    input.ownerPending,
    input.overlayQueueRef,
    input.pendingChain,
    input.notificationChain,
    deferredQueue,
  ];

  const nextCandidate = findNextCandidate(searchQueues, input.resultBanId);
  const hasCheckCandidateAfterResult =
    searchQueues.some((queue) =>
      hasKindAfterResult(queue, input.resultBanId, 'check'),
    ) ||
    (input.heldOverlayKind === 'check' &&
      normalizeId(input.heldOverlayBanId ?? '') !==
        normalizeId(input.resultBanId)) ||
    Boolean(
      input.displayCheckBanId &&
        normalizeId(input.displayCheckBanId) !== normalizeId(input.resultBanId),
    );
  const hasIncomingCandidateAfterResult =
    searchQueues.some((queue) =>
      hasKindAfterResult(queue, input.resultBanId, 'incoming'),
    ) ||
    (input.heldOverlayKind === 'incoming' &&
      normalizeId(input.heldOverlayBanId ?? '') !==
        normalizeId(input.resultBanId)) ||
    Boolean(
      input.displayIncomingBanId &&
        normalizeId(input.displayIncomingBanId) !==
          normalizeId(input.resultBanId),
    );

  const payload: PreResultGoToBansQueueSourceTrace = {
    timestamp: diagTraceNow(),
    resultBanId: input.resultBanId,
    activeKind: input.activeKind,
    activeBanId: input.activeBanId,
    overlayQueueRefLength: input.overlayQueueRef.length,
    overlayQueueRefKinds: queueKinds(input.overlayQueueRef),
    overlayQueueRefIds: queueIds(input.overlayQueueRef),
    overlayQueueStateLength: input.overlayQueueState.length,
    overlayQueueStateKinds: queueKinds(input.overlayQueueState),
    overlayQueueStateIds: queueIds(input.overlayQueueState),
    ownerQueueLen: input.ownerQueue.length,
    ownerQueueKinds: queueKinds(input.ownerQueue),
    ownerQueueIds: queueIds(input.ownerQueue),
    ownerPendingLen: input.ownerPending.length,
    ownerPendingKinds: queueKinds(input.ownerPending),
    ownerPendingIds: queueIds(input.ownerPending),
    pendingChainLength: input.pendingChain.length,
    pendingChainKinds: queueKinds(input.pendingChain),
    notificationChainLength: input.notificationChain.length,
    notificationChainKinds: queueKinds(input.notificationChain),
    nextCandidateKind: nextCandidate.kind,
    nextCandidateId: nextCandidate.id,
    hasCheckCandidateAfterResult,
    hasIncomingCandidateAfterResult,
    sourceFunction:
      input.sourceFunction ?? 'finalizeResultForGoToBans:before-RESULT_GO_TO_BANS',
    stack: capturePreResultGoToBansQueueSourceStack(),
  };

  emitClientDiagTrace('PRE_RESULT_GO_TO_BANS_QUEUE_SOURCE_TRACE', payload);
}
