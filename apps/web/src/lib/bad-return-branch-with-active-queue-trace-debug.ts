'use client';

import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type BadReturnBranchWithActiveQueueTraceInput = {
  branchId: string;
  functionName: string;
  renderBranch?: string | null;
  shellKind?: string | null;
  effectiveKind?: string | null;
  actualKind?: string | null;
  queueHeadKind?: string | null;
  overlayQueueLength?: number;
  overlayQueueHeadKind?: string | null;
  overlayQueueHeadId?: string | null;
  ownerQueueLen?: number;
  ownerPendingLen?: number;
  notificationHostMounted?: boolean | null;
  notificationOverlayVisible?: boolean;
  visualQueueDimSessionLive?: boolean;
  queueClaimsNotificationScreen?: boolean;
  reason?: string | null;
};

export type BadReturnBranchWithActiveQueueTrace = {
  timestamp: number;
  branchId: string;
  functionName: string;
  renderBranch: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  actualKind: string | null;
  queueHeadKind: string | null;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  notificationHostMounted: boolean | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
  reason: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  lastRenderBranch: string | null;
  lastActualComponentName: string | null;
};

let emittedSig = '';

function hasActiveQueueContext(input: BadReturnBranchWithActiveQueueTraceInput): boolean {
  return (
    (input.overlayQueueLength ?? 0) > 0 ||
    (input.ownerQueueLen ?? 0) > 0 ||
    input.notificationOverlayVisible === true ||
    input.visualQueueDimSessionLive === true ||
    input.queueClaimsNotificationScreen === true
  );
}

function hasBadReturnBranchState(
  input: BadReturnBranchWithActiveQueueTraceInput,
): boolean {
  return (
    input.renderBranch === 'no-shell-branch' ||
    input.shellKind == null ||
    input.effectiveKind == null
  );
}

function buildBadReturnBranchSignature(
  trace: BadReturnBranchWithActiveQueueTrace,
): string {
  return [
    trace.branchId,
    trace.renderBranch,
    trace.shellKind,
    trace.effectiveKind,
    trace.actualKind,
    trace.queueHeadKind,
    trace.overlayQueueLength,
    trace.overlayQueueHeadKind,
    trace.overlayQueueHeadId,
    trace.ownerQueueLen,
    trace.ownerPendingLen,
    trace.notificationHostMounted,
    trace.notificationOverlayVisible,
    trace.visualQueueDimSessionLive,
    trace.queueClaimsNotificationScreen,
    trace.reason,
    trace.lastOverlayQueueMutationOperation,
    trace.lastOverlayQueueMutationPrevHead,
    trace.lastOverlayQueueMutationNextHead,
    trace.lastOverlayQueueMutationNextLen,
    trace.lastRenderBranch,
    trace.lastActualComponentName,
  ].join('|');
}

export function traceBadReturnBranchWithActiveQueueIfNeeded(
  input: BadReturnBranchWithActiveQueueTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!hasBadReturnBranchState(input)) return;
  if (!hasActiveQueueContext(input)) return;

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();

  const payload: BadReturnBranchWithActiveQueueTrace = {
    timestamp: diagTraceNow(),
    branchId: input.branchId,
    functionName: input.functionName,
    renderBranch: input.renderBranch ?? null,
    shellKind: input.shellKind ?? null,
    effectiveKind: input.effectiveKind ?? null,
    actualKind: input.actualKind ?? null,
    queueHeadKind: input.queueHeadKind ?? null,
    overlayQueueLength: input.overlayQueueLength ?? 0,
    overlayQueueHeadKind: input.overlayQueueHeadKind ?? null,
    overlayQueueHeadId: input.overlayQueueHeadId ?? null,
    ownerQueueLen: input.ownerQueueLen ?? 0,
    ownerPendingLen: input.ownerPendingLen ?? 0,
    notificationHostMounted: input.notificationHostMounted ?? null,
    notificationOverlayVisible: input.notificationOverlayVisible ?? false,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive ?? false,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen ?? false,
    reason: input.reason ?? null,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    lastActualComponentName: renderBranchSnapshot?.component ?? null,
  };

  const sig = buildBadReturnBranchSignature(payload);
  if (emittedSig === sig) return;
  emittedSig = sig;
  emitClientDiagTrace('BAD_RETURN_BRANCH_WITH_ACTIVE_QUEUE_TRACE', payload);
}
