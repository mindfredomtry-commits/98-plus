'use client';

import type { QueueLobbyGuardSnapshot } from '@/lib/queue-lobby-guard';
import {
  getQueueLobbyGuardSnapshot,
  shouldBlockLobbyForActiveQueue,
} from '@/lib/queue-lobby-guard';
import {
  buildQueueClaimsInputTrace,
  readQueueClaimsNotificationScreenSnapshot,
  type QueueClaimsInputTrace,
} from '@/lib/queue-claims-notification-screen-trace-debug';
import { getLastOwnerQueueMutationSnapshot } from '@/lib/owner-queue-population-trace';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OverlayShellEmptyWhileQueueActiveReason =
  | 'queue-active-shell-kind-null'
  | 'queue-active-shell-hidden'
  | 'queue-active-base-has-no-overlay';

export type OverlayShellEmptyWhileQueueActiveTrace = {
  timestamp: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  activeKind: string | null;
  activeOverlayKind: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
  baseLobbyHasOverlay: boolean;
  overlayKind: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  queueHeadKind: string | null;
  resultOverlayMounted: boolean;
  incomingOverlayMounted: boolean;
  checkOverlayMounted: boolean;
  reason: OverlayShellEmptyWhileQueueActiveReason;
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;
  queueClaimsNotificationScreen: boolean;
  queueLobbyGuardActive: boolean;
  guardSnapshot: QueueLobbyGuardSnapshot | null;
  lastOverlayQueueMutationSource: string | null;
  lastOverlayQueueMutationReason: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevLen: number | null;
  lastOverlayQueueMutationNextLen: number | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOwnerQueueMutationSource: string | null;
  lastOwnerQueueMutationReason: string | null;
  lastOwnerQueueLen: number | null;
  lastOwnerPendingLen: number | null;
  lastRenderBranch: string | null;
  lastRenderBranchReason: string | null;
};

let emittedSig = '';

export function resolveOverlayShellEmptyWhileQueueActiveReason(input: {
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
}): OverlayShellEmptyWhileQueueActiveReason | null {
  if (input.actualKind == null) return 'queue-active-shell-kind-null';
  if (!input.visible) return 'queue-active-shell-hidden';
  if (!input.hasOverlay) return 'queue-active-base-has-no-overlay';
  return null;
}

function shouldEmitOverlayShellEmptyWhileQueueActive(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  visualQueueDimSessionLive: boolean;
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
  sendFlowOpening: boolean;
}): boolean {
  if (input.sendFlowOpening) return false;
  const queueOrDimActive =
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    input.visualQueueDimSessionLive === true;
  if (!queueOrDimActive) return false;
  return (
    input.actualKind == null ||
    input.visible === false ||
    input.hasOverlay === false
  );
}

function buildOverlayShellEmptyClaimsContext(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  resultOverlayMounted: boolean;
  directOverboardMounted?: boolean | null;
  staleResultQueueClaimActive?: boolean | null;
}): {
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;
  queueClaimsNotificationScreen: boolean;
  queueLobbyGuardActive: boolean;
  guardSnapshot: QueueLobbyGuardSnapshot | null;
} {
  const claimsSnap = readQueueClaimsNotificationScreenSnapshot() ?? {};
  const guardSnapshot =
    claimsSnap.guardSnapshot ?? getQueueLobbyGuardSnapshot();
  const queueLobbyGuardActive =
    claimsSnap.queueLobbyGuardActive ??
    shouldBlockLobbyForActiveQueue(guardSnapshot);
  const effectiveOverlayQueueLength =
    claimsSnap.effectiveOverlayQueueLength ?? input.overlayQueueLength;
  const { claimInputs, claimWinningInputs } = buildQueueClaimsInputTrace({
    overlayQueueLength: input.overlayQueueLength,
    effectiveOverlayQueueLength,
    queueLobbyGuardActive,
    guardSnapshot,
    staleResultQueueClaimActive: claimsSnap.staleResultQueueClaimActive,
    notificationOverlayVisible:
      input.notificationOverlayVisible ??
      claimsSnap.notificationOverlayVisible ??
      null,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ??
      claimsSnap.visualQueueDimSessionLive ??
      null,
    resultOverlayMounted:
      input.resultOverlayMounted ??
      claimsSnap.resultOverlayMounted ??
      null,
    directOverboardMounted:
      input.directOverboardMounted ??
      claimsSnap.directOverboardMounted ??
      null,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
  });
  const queueClaimsNotificationScreen =
    claimsSnap.queueClaimsNotificationScreen ??
    (effectiveOverlayQueueLength > 0 || queueLobbyGuardActive === true);

  return {
    claimInputs,
    claimWinningInputs,
    queueClaimsNotificationScreen,
    queueLobbyGuardActive: queueLobbyGuardActive === true,
    guardSnapshot,
  };
}

export function traceOverlayShellEmptyWhileQueueActiveIfChanged(
  input: {
    ownerQueueLen: number;
    ownerPendingLen: number;
    overlayQueueLength: number;
    activeKind: string | null;
    activeOverlayKind: string | null;
    shellKind: string | null;
    effectiveKind: string | null;
    actualKind: string | null;
    visible: boolean;
    hasOverlay: boolean;
    baseLobbyHasOverlay: boolean;
    overlayKind: string | null;
    notificationOverlayVisible: boolean;
    visualQueueDimSessionLive: boolean;
    backdropMounted: boolean;
    backdropActive: boolean;
    queueHeadKind: string | null;
    resultOverlayMounted: boolean;
    incomingOverlayMounted: boolean;
    checkOverlayMounted: boolean;
    sendFlowOpening: boolean;
    directOverboardMounted?: boolean | null;
    staleResultQueueClaimActive?: boolean | null;
  },
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (
    !shouldEmitOverlayShellEmptyWhileQueueActive({
      ownerQueueLen: input.ownerQueueLen,
      ownerPendingLen: input.ownerPendingLen,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      actualKind: input.actualKind,
      visible: input.visible,
      hasOverlay: input.hasOverlay,
      sendFlowOpening: input.sendFlowOpening,
    })
  ) {
    return;
  }

  const reason = resolveOverlayShellEmptyWhileQueueActiveReason({
    actualKind: input.actualKind,
    visible: input.visible,
    hasOverlay: input.hasOverlay,
  });
  if (reason == null) return;

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const ownerMutation = getLastOwnerQueueMutationSnapshot();
  const renderBranch = getLastRenderBranchSnapshot();
  const claims = buildOverlayShellEmptyClaimsContext({
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    overlayQueueLength: input.overlayQueueLength,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    resultOverlayMounted: input.resultOverlayMounted,
    directOverboardMounted: input.directOverboardMounted,
    staleResultQueueClaimActive: input.staleResultQueueClaimActive,
  });

  const {
    sendFlowOpening: _sendFlowOpening,
    directOverboardMounted,
    staleResultQueueClaimActive,
    ...fields
  } = input;

  const payload: OverlayShellEmptyWhileQueueActiveTrace = {
    timestamp: diagTraceNow(),
    ...fields,
    reason,
    claimInputs: claims.claimInputs,
    claimWinningInputs: claims.claimWinningInputs,
    queueClaimsNotificationScreen: claims.queueClaimsNotificationScreen,
    queueLobbyGuardActive: claims.queueLobbyGuardActive,
    guardSnapshot: claims.guardSnapshot,
    lastOverlayQueueMutationSource: overlayMutation?.source ?? null,
    lastOverlayQueueMutationReason: overlayMutation?.reason ?? null,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevLen: overlayMutation?.prevLen ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOwnerQueueMutationSource: ownerMutation?.source ?? null,
    lastOwnerQueueMutationReason: ownerMutation?.reason ?? null,
    lastOwnerQueueLen: ownerMutation?.ownerQueueLen ?? null,
    lastOwnerPendingLen: ownerMutation?.ownerPendingLen ?? null,
    lastRenderBranch: renderBranch?.renderBranch ?? null,
    lastRenderBranchReason: renderBranch?.reason ?? null,
  };

  const sig = [
    payload.reason,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.overlayQueueLength,
    payload.activeKind,
    payload.activeOverlayKind,
    payload.shellKind,
    payload.effectiveKind,
    payload.actualKind,
    payload.visible,
    payload.hasOverlay,
    payload.baseLobbyHasOverlay,
    payload.overlayKind,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.backdropMounted,
    payload.backdropActive,
    payload.queueHeadKind,
    payload.resultOverlayMounted,
    payload.incomingOverlayMounted,
    payload.checkOverlayMounted,
    payload.queueClaimsNotificationScreen,
    payload.queueLobbyGuardActive,
    payload.claimWinningInputs.join(','),
    payload.guardSnapshot?.phase,
    payload.lastOverlayQueueMutationSource,
    payload.lastOverlayQueueMutationReason,
    payload.lastOverlayQueueMutationOperation,
    payload.lastOverlayQueueMutationPrevLen,
    payload.lastOverlayQueueMutationNextLen,
    payload.lastOwnerQueueMutationSource,
    payload.lastOwnerQueueMutationReason,
    payload.lastRenderBranch,
    payload.lastRenderBranchReason,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('OVERLAY_SHELL_EMPTY_WHILE_QUEUE_ACTIVE', payload);
}
