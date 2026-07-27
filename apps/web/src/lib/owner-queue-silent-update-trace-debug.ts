'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OwnerQueueSilentUpdateRenderSnapshot = {
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellQueueHeadKind: string | null;
  ownerPendingLength: number;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  queueHeadShellKindFallback: string | null;
  renderBranch: string | null;
  activeKind: string | null;
};

let renderSnapshotProvider: (() => OwnerQueueSilentUpdateRenderSnapshot | null) | null =
  null;

export function registerOwnerQueueSilentUpdateRenderSnapshotProvider(
  provider: (() => OwnerQueueSilentUpdateRenderSnapshot | null) | null,
): void {
  renderSnapshotProvider = provider;
}

function captureDiagStack(maxLines = 8): string | null {
  try {
    const stack = new Error().stack;
    if (!stack) return null;
    return stack
      .split('\n')
      .slice(2, 2 + maxLines)
      .map((line) => line.trim())
      .join('\n');
  } catch {
    return null;
  }
}

export function resolveOwnerQueueSilentUpdatePath(input: {
  functionName: string;
  source: string;
  updateReason: string;
}): string {
  if (input.functionName === 'resetOverlayQueueState') {
    return `resetOverlayQueueState:${input.source}`;
  }
  if (input.functionName === 'applyQueueViaOwnerAuthority') {
    return `applyQueueViaOwnerAuthority:${input.source}`;
  }
  return `${input.functionName}:${input.source}`;
}

export function resolveWhySilentUpdateAllowed(input: {
  functionName: string;
  updateReason: string;
  silent?: boolean;
}): string {
  if (input.functionName === 'resetOverlayQueueState') {
    return 'step2b-queue-reset-exception-silent-dispatch';
  }
  if (input.updateReason === 'QUEUE_SILENT_UPDATED-clear') {
    return 'owner-queue-cleared-via-resetOverlayQueueState';
  }
  if (input.silent === true) {
    return 'step2a-silent-commit-via-applyOverlayQueue-skips-display-sync';
  }
  return 'queue-silent-updated-dispatch';
}

export type OwnerQueueSilentUpdateTrace = {
  timestamp: number;
  caller: string;
  source: string;
  functionName: string;
  updateReason: string;
  prevOwnerQueueLength: number;
  nextOwnerQueueLength: number;
  prevOwnerQueueHeadKind: string | null;
  nextOwnerQueueHeadKind: string | null;
  prevOwnerQueueHeadId: string | null;
  nextOwnerQueueHeadId: string | null;
  prevOwnerPrimaryShellQueueLen: number;
  nextOwnerPrimaryShellQueueLen: number;
  prevOwnerPrimaryShellQueueHeadKind: string | null;
  nextOwnerPrimaryShellQueueHeadKind: string | null;
  ownerPendingLength: number;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  clearedWhileOverlayCandidateExists: boolean;
  activeKind: string | null;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  queueHeadShellKindFallback: string | null;
  renderBranch: string | null;
  lastRenderBranch: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  stack: string | null;
  exactSilentUpdatePath: string;
  whySilentUpdateAllowed: string;
  reason: 'owner-queue-silent-updated';
};

const emittedSigs = new Set<string>();

export function traceOwnerQueueSilentUpdate(input: {
  caller: string;
  source: string;
  functionName: string;
  updateReason: string;
  silent?: boolean;
  prevOwnerQueue: readonly QueuedOverlay[];
  nextOwnerQueue: readonly QueuedOverlay[];
  overlayQueueLength: number;
  overlayQueueHead: QueuedOverlay | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const prevHead = input.prevOwnerQueue[0] ?? null;
  const nextHead = input.nextOwnerQueue[0] ?? null;
  const overlayQueueHeadKind = input.overlayQueueHead?.kind ?? null;
  const clearedWhileOverlayCandidateExists =
    input.overlayQueueLength > 0 && overlayQueueHeadKind != null;

  const exactSilentUpdatePath = resolveOwnerQueueSilentUpdatePath({
    functionName: input.functionName,
    source: input.source,
    updateReason: input.updateReason,
  });
  const whySilentUpdateAllowed = resolveWhySilentUpdateAllowed({
    functionName: input.functionName,
    updateReason: input.updateReason,
    silent: input.silent,
  });

  const sig = [
    exactSilentUpdatePath,
    input.caller,
    input.updateReason,
    input.prevOwnerQueue.length,
    input.nextOwnerQueue.length,
    prevHead?.kind ?? null,
    nextHead?.kind ?? null,
    queueHeadIdFrom(prevHead),
    queueHeadIdFrom(nextHead),
    input.overlayQueueLength,
    overlayQueueHeadKind,
    queueHeadIdFrom(input.overlayQueueHead),
    clearedWhileOverlayCandidateExists,
  ].join('|');
  if (emittedSigs.has(sig)) return;
  emittedSigs.add(sig);

  const renderSnapshot = renderSnapshotProvider?.() ?? null;
  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();

  const payload: OwnerQueueSilentUpdateTrace = {
    timestamp: diagTraceNow(),
    caller: input.caller,
    source: input.source,
    functionName: input.functionName,
    updateReason: input.updateReason,
    prevOwnerQueueLength: input.prevOwnerQueue.length,
    nextOwnerQueueLength: input.nextOwnerQueue.length,
    prevOwnerQueueHeadKind: prevHead?.kind ?? null,
    nextOwnerQueueHeadKind: nextHead?.kind ?? null,
    prevOwnerQueueHeadId: queueHeadIdFrom(prevHead),
    nextOwnerQueueHeadId: queueHeadIdFrom(nextHead),
    prevOwnerPrimaryShellQueueLen: input.prevOwnerQueue.length,
    nextOwnerPrimaryShellQueueLen: input.nextOwnerQueue.length,
    prevOwnerPrimaryShellQueueHeadKind: prevHead?.kind ?? null,
    nextOwnerPrimaryShellQueueHeadKind: nextHead?.kind ?? null,
    ownerPendingLength: renderSnapshot?.ownerPendingLength ?? -1,
    overlayQueueLength: input.overlayQueueLength,
    overlayQueueHeadKind,
    overlayQueueHeadId: queueHeadIdFrom(input.overlayQueueHead),
    clearedWhileOverlayCandidateExists,
    activeKind: renderSnapshot?.activeKind ?? null,
    shellKind: renderSnapshot?.shellKind ?? null,
    actualKind: renderSnapshot?.actualKind ?? null,
    effectiveKind: renderSnapshot?.effectiveKind ?? null,
    notificationQueueShellKind: renderSnapshot?.notificationQueueShellKind ?? null,
    effectiveNotificationQueueShellKind:
      renderSnapshot?.effectiveNotificationQueueShellKind ?? null,
    queueHeadShellKindFallback: renderSnapshot?.queueHeadShellKindFallback ?? null,
    renderBranch: renderSnapshot?.renderBranch ?? null,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    stack: captureDiagStack(),
    exactSilentUpdatePath,
    whySilentUpdateAllowed,
    reason: 'owner-queue-silent-updated',
  };

  emitClientDiagTrace('OWNER_QUEUE_SILENT_UPDATE_TRACE', payload);
}
