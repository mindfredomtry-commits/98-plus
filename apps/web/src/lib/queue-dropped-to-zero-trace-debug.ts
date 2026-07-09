'use client';

import { getLastOwnerQueueMutationSnapshot } from '@/lib/owner-queue-population-trace';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import { readQueueHeadMutationContext } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueDroppedToZeroSnapshot = {
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  ownerQueueHeadKind: string | null;
  ownerQueueHeadId: string | null;
};

export type QueueDroppedToZeroTrace = {
  timestamp: number;
  prevOverlayQueueLength: number;
  nextOverlayQueueLength: number;
  prevOverlayQueueHeadKind: string | null;
  nextOverlayQueueHeadKind: string | null;
  prevOverlayQueueHeadId: string | null;
  nextOverlayQueueHeadId: string | null;
  prevOwnerQueueLen: number;
  nextOwnerQueueLen: number;
  prevOwnerPendingLen: number;
  nextOwnerPendingLen: number;
  prevOwnerQueueHeadKind: string | null;
  nextOwnerQueueHeadKind: string | null;
  prevOwnerQueueHeadId: string | null;
  nextOwnerQueueHeadId: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  ownerQueueMutationReason: string | null;
  caller: string | null;
  source: string | null;
  functionName: string | null;
  renderBranch: string | null;
  lastRenderBranch: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  actualKind: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
  stack: string | null;
};

let emittedTransitionSig = '';

function hadAnyQueueActivity(snapshot: QueueDroppedToZeroSnapshot): boolean {
  return (
    snapshot.overlayQueueLength > 0 ||
    snapshot.ownerQueueLen > 0 ||
    snapshot.ownerPendingLen > 0
  );
}

function isFullyDropped(snapshot: QueueDroppedToZeroSnapshot): boolean {
  return (
    snapshot.overlayQueueLength === 0 &&
    snapshot.ownerQueueLen === 0 &&
    snapshot.ownerPendingLen === 0
  );
}

function captureStack(): string | null {
  try {
    return new Error('QUEUE_DROPPED_TO_ZERO_TRACE').stack ?? null;
  } catch {
    return null;
  }
}

export function traceQueueDroppedToZeroIfTransition(input: {
  prev: QueueDroppedToZeroSnapshot | null;
  next: QueueDroppedToZeroSnapshot;
  renderBranch?: string | null;
  shellKind?: string | null;
  effectiveKind?: string | null;
  actualKind?: string | null;
  notificationOverlayVisible?: boolean;
  visualQueueDimSessionLive?: boolean;
  queueClaimsNotificationScreen?: boolean;
  functionName?: string | null;
}): QueueDroppedToZeroSnapshot {
  const nextSnapshot = input.next;

  if (!isClientDiagTraceEnvironment() || input.prev == null) {
    return nextSnapshot;
  }

  if (!hadAnyQueueActivity(input.prev) || !isFullyDropped(input.next)) {
    return nextSnapshot;
  }

  const transitionSig = [
    input.prev.overlayQueueLength,
    input.prev.ownerQueueLen,
    input.prev.ownerPendingLen,
    input.prev.overlayQueueHeadKind,
    input.prev.overlayQueueHeadId,
    input.prev.ownerQueueHeadKind,
    input.prev.ownerQueueHeadId,
    input.next.overlayQueueLength,
    input.next.ownerQueueLen,
    input.next.ownerPendingLen,
  ].join('|');
  if (emittedTransitionSig === transitionSig) {
    return nextSnapshot;
  }
  emittedTransitionSig = transitionSig;

  const ownerMutation = getLastOwnerQueueMutationSnapshot();
  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();
  const queueHeadMutation = readQueueHeadMutationContext();

  const payload: QueueDroppedToZeroTrace = {
    timestamp: diagTraceNow(),
    prevOverlayQueueLength: input.prev.overlayQueueLength,
    nextOverlayQueueLength: input.next.overlayQueueLength,
    prevOverlayQueueHeadKind: input.prev.overlayQueueHeadKind,
    nextOverlayQueueHeadKind: input.next.overlayQueueHeadKind,
    prevOverlayQueueHeadId: input.prev.overlayQueueHeadId,
    nextOverlayQueueHeadId: input.next.overlayQueueHeadId,
    prevOwnerQueueLen: input.prev.ownerQueueLen,
    nextOwnerQueueLen: input.next.ownerQueueLen,
    prevOwnerPendingLen: input.prev.ownerPendingLen,
    nextOwnerPendingLen: input.next.ownerPendingLen,
    prevOwnerQueueHeadKind: input.prev.ownerQueueHeadKind,
    nextOwnerQueueHeadKind: input.next.ownerQueueHeadKind,
    prevOwnerQueueHeadId: input.prev.ownerQueueHeadId,
    nextOwnerQueueHeadId: input.next.ownerQueueHeadId,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    ownerQueueMutationReason: ownerMutation?.reason ?? null,
    caller: queueHeadMutation?.source ?? ownerMutation?.source ?? null,
    source: ownerMutation?.source ?? queueHeadMutation?.source ?? null,
    functionName: input.functionName ?? 'ProvidersBody',
    renderBranch: input.renderBranch ?? null,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    shellKind: input.shellKind ?? null,
    effectiveKind: input.effectiveKind ?? null,
    actualKind: input.actualKind ?? null,
    notificationOverlayVisible: input.notificationOverlayVisible ?? false,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive ?? false,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen ?? false,
    stack: captureStack(),
  };

  emitClientDiagTrace('QUEUE_DROPPED_TO_ZERO_TRACE', payload);
  return nextSnapshot;
}
