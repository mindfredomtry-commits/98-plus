'use client';

import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

const HANDOFF_STALLED_MUTATION_OPS = new Set(['dequeue', 'replace', 'clear']);

export type OverlayNextHandoffStalledTrace = {
  timestamp: number;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationReason: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationPrevLen: number | null;
  lastOverlayQueueMutationNextLen: number | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  queueHeadKind: string | null;
  activeKind: string | null;
  activeOverlayKind: string | null;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  nextOverlayCandidateKind: string | null;
  nextOverlayCandidateId: string | null;
  nextOwnerQueueHeadKind: string | null;
  nextOwnerQueueHeadId: string | null;
  pendingOverlayKind: string | null;
  pendingOverlayId: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  reason: 'shell-cleared-before-next-overlay-ready';
};

let emittedSig = '';

function shouldEmitOverlayNextHandoffStalled(input: {
  visualQueueDimSessionLive: boolean;
  shellKind: string | null;
  actualKind: string | null;
  backdropMounted: boolean;
  lastOverlayQueueMutationOperation: string | null;
}): boolean {
  if (input.visualQueueDimSessionLive !== true) return false;
  if (input.shellKind != null || input.actualKind != null) return false;
  if (input.backdropMounted !== true) return false;
  const op = input.lastOverlayQueueMutationOperation;
  if (!op || !HANDOFF_STALLED_MUTATION_OPS.has(op)) return false;
  return true;
}

export function traceOverlayNextHandoffStalledIfChanged(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  queueHeadKind: string | null;
  activeKind: string | null;
  activeOverlayKind: string | null;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  nextOverlayCandidateKind: string | null;
  nextOverlayCandidateId: string | null;
  nextOwnerQueueHeadKind: string | null;
  nextOwnerQueueHeadId: string | null;
  pendingOverlayKind: string | null;
  pendingOverlayId: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const lastOverlayQueueMutationOperation = overlayMutation?.operation ?? null;

  if (
    !shouldEmitOverlayNextHandoffStalled({
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      shellKind: input.shellKind,
      actualKind: input.actualKind,
      backdropMounted: input.backdropMounted,
      lastOverlayQueueMutationOperation,
    })
  ) {
    return;
  }

  const payload: OverlayNextHandoffStalledTrace = {
    timestamp: diagTraceNow(),
    lastOverlayQueueMutationOperation,
    lastOverlayQueueMutationReason: overlayMutation?.reason ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationPrevLen: overlayMutation?.prevLen ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    overlayQueueLength: input.overlayQueueLength,
    queueHeadKind: input.queueHeadKind,
    activeKind: input.activeKind,
    activeOverlayKind: input.activeOverlayKind,
    shellKind: input.shellKind,
    actualKind: input.actualKind,
    effectiveKind: input.effectiveKind,
    nextOverlayCandidateKind: input.nextOverlayCandidateKind,
    nextOverlayCandidateId: input.nextOverlayCandidateId,
    nextOwnerQueueHeadKind: input.nextOwnerQueueHeadKind,
    nextOwnerQueueHeadId: input.nextOwnerQueueHeadId,
    pendingOverlayKind: input.pendingOverlayKind,
    pendingOverlayId: input.pendingOverlayId,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    backdropMounted: input.backdropMounted,
    backdropActive: input.backdropActive,
    reason: 'shell-cleared-before-next-overlay-ready',
  };

  const sig = [
    payload.lastOverlayQueueMutationOperation,
    payload.lastOverlayQueueMutationReason,
    payload.lastOverlayQueueMutationPrevHead,
    payload.lastOverlayQueueMutationNextHead,
    payload.lastOverlayQueueMutationPrevLen,
    payload.lastOverlayQueueMutationNextLen,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.overlayQueueLength,
    payload.queueHeadKind,
    payload.activeKind,
    payload.activeOverlayKind,
    payload.shellKind,
    payload.actualKind,
    payload.effectiveKind,
    payload.nextOverlayCandidateKind,
    payload.nextOverlayCandidateId,
    payload.nextOwnerQueueHeadKind,
    payload.nextOwnerQueueHeadId,
    payload.pendingOverlayKind,
    payload.pendingOverlayId,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.backdropMounted,
    payload.backdropActive,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('OVERLAY_NEXT_HANDOFF_STALLED', payload);
}
