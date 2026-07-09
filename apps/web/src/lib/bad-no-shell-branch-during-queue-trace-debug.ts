'use client';

import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

const EXCLUDED_BRANCH_IDS = new Set([
  'providers-wrapper-return',
  'providers-body-root-return',
]);

export type BadNoShellBranchDuringQueueTraceInput = {
  branchId: string;
  renderBranch?: string | null;
  shellKind?: string | null;
  effectiveKind?: string | null;
  actualKind?: string | null;
  overlayQueueLength?: number;
  overlayQueueHeadKind?: string | null;
  ownerQueueLen?: number;
  ownerPendingLen?: number;
  queueClaimsNotificationScreen?: boolean;
  notificationOverlayVisible?: boolean;
  visualQueueDimSessionLive?: boolean;
  reason?: string | null;
};

export type BadNoShellBranchDuringQueueTrace = {
  timestamp: number;
  branchId: string;
  reason: string | null;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueClaimsNotificationScreen: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastRenderBranch: string | null;
};

let emittedSig = '';

function hasNoShellBranchState(
  input: BadNoShellBranchDuringQueueTraceInput,
): boolean {
  return (
    input.renderBranch === 'no-shell-branch' &&
    input.shellKind == null &&
    input.effectiveKind == null &&
    input.actualKind == null
  );
}

function hasQueueActivity(
  input: BadNoShellBranchDuringQueueTraceInput,
): boolean {
  return (
    (input.overlayQueueLength ?? 0) > 0 ||
    (input.ownerQueueLen ?? 0) > 0 ||
    input.queueClaimsNotificationScreen === true
  );
}

function shouldExcludeBranch(input: BadNoShellBranchDuringQueueTraceInput): boolean {
  if (EXCLUDED_BRANCH_IDS.has(input.branchId)) return true;
  const overlayQueueLength = input.overlayQueueLength ?? 0;
  const ownerQueueLen = input.ownerQueueLen ?? 0;
  const queueClaimsNotificationScreen = input.queueClaimsNotificationScreen === true;
  return (
    overlayQueueLength === 0 &&
    ownerQueueLen === 0 &&
    !queueClaimsNotificationScreen
  );
}

function buildNoShellBranchDuringQueueSignature(
  trace: BadNoShellBranchDuringQueueTrace,
): string {
  return [
    trace.branchId,
    trace.overlayQueueLength,
    trace.overlayQueueHeadKind,
    trace.ownerQueueLen,
    trace.ownerPendingLen,
    trace.queueClaimsNotificationScreen,
    trace.notificationOverlayVisible,
    trace.visualQueueDimSessionLive,
    trace.reason,
    trace.lastOverlayQueueMutationOperation,
    trace.lastOverlayQueueMutationPrevHead,
    trace.lastOverlayQueueMutationNextHead,
    trace.lastRenderBranch,
  ].join('|');
}

export function traceBadNoShellBranchDuringQueueIfNeeded(
  input: BadNoShellBranchDuringQueueTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!hasNoShellBranchState(input)) return;
  if (!hasQueueActivity(input)) return;
  if (shouldExcludeBranch(input)) return;

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();

  const payload: BadNoShellBranchDuringQueueTrace = {
    timestamp: diagTraceNow(),
    branchId: input.branchId,
    reason: input.reason ?? null,
    overlayQueueLength: input.overlayQueueLength ?? 0,
    overlayQueueHeadKind: input.overlayQueueHeadKind ?? null,
    ownerQueueLen: input.ownerQueueLen ?? 0,
    ownerPendingLen: input.ownerPendingLen ?? 0,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen ?? false,
    notificationOverlayVisible: input.notificationOverlayVisible ?? false,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive ?? false,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
  };

  const sig = buildNoShellBranchDuringQueueSignature(payload);
  if (emittedSig === sig) return;
  emittedSig = sig;
  emitClientDiagTrace('BAD_NO_SHELL_BRANCH_DURING_QUEUE_TRACE', payload);
}
