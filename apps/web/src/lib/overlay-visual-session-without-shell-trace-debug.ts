'use client';

import { readOverlayGapFrameDom } from '@/lib/overlay-gap-frame-classify-debug';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OverlayVisualSessionWithoutShellTrace = {
  timestamp: number;
  visualQueueDimSessionLive: boolean;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  hasOverlay: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  backdropComputedOpacity: string | null;
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationReason: string | null;
  lastRenderBranch: string | null;
  lastRenderBranchReason: string | null;
  reason: 'visual-session-dim-without-shell';
};

let emittedSig = '';

function shouldEmitOverlayVisualSessionWithoutShell(input: {
  visualQueueDimSessionLive: boolean;
  shellKind: string | null;
  actualKind: string | null;
  backdropMounted: boolean;
}): boolean {
  return (
    input.visualQueueDimSessionLive === true &&
    input.shellKind == null &&
    input.actualKind == null &&
    input.backdropMounted === true
  );
}

export function traceOverlayVisualSessionWithoutShellIfChanged(input: {
  visualQueueDimSessionLive: boolean;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  hasOverlay: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  backdropComputedOpacity?: string | null;
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const dom = readOverlayGapFrameDom();
  const backdropMounted = input.backdropMounted || dom.backdropMounted;
  const backdropActive = input.backdropActive || dom.backdropActive;
  const backdropComputedOpacity =
    input.backdropComputedOpacity ?? dom.backdropComputedOpacity;

  if (
    !shouldEmitOverlayVisualSessionWithoutShell({
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      shellKind: input.shellKind,
      actualKind: input.actualKind,
      backdropMounted,
    })
  ) {
    return;
  }

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranch = getLastRenderBranchSnapshot();

  const payload: OverlayVisualSessionWithoutShellTrace = {
    timestamp: diagTraceNow(),
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    shellKind: input.shellKind,
    actualKind: input.actualKind,
    effectiveKind: input.effectiveKind,
    hasOverlay: input.hasOverlay,
    backdropMounted,
    backdropActive,
    backdropComputedOpacity,
    overlayQueueLength: input.overlayQueueLength,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationReason: overlayMutation?.reason ?? null,
    lastRenderBranch: renderBranch?.renderBranch ?? null,
    lastRenderBranchReason: renderBranch?.reason ?? null,
    reason: 'visual-session-dim-without-shell',
  };

  const sig = [
    payload.visualQueueDimSessionLive,
    payload.shellKind,
    payload.actualKind,
    payload.effectiveKind,
    payload.hasOverlay,
    payload.backdropMounted,
    payload.backdropActive,
    payload.backdropComputedOpacity,
    payload.overlayQueueLength,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.lastOverlayQueueMutationOperation,
    payload.lastOverlayQueueMutationReason,
    payload.lastRenderBranch,
    payload.lastRenderBranchReason,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('OVERLAY_VISUAL_SESSION_WITHOUT_SHELL_TRACE', payload);
}
