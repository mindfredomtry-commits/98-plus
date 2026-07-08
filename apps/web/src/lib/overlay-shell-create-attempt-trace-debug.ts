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

export type OverlayShellCreateAttemptPipeline = {
  composeBlocksNotificationHost: boolean;
  checkAnswerWaitingResultHoldBanId: string | null;
  chainAdvanceWaiting: boolean;
  chainAdvancePlaceholderKind: string | null;
  replyIncomingDirectPath: boolean;
  incomingNotificationShellKind: string | null;
  queueHeadShellKindFallback: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  notificationQueueShellDisplayKind: string | null;
  notificationQueueShellDisplayKindResolved: string | null;
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
  ownerQueueHeadKind: string | null;
  renderableResultShell: boolean;
  checkShellKindWithoutBan: boolean;
  showDirectOverboardLayer: boolean;
};

export type OverlayShellCreateAttemptTrace = {
  timestamp: number;
  candidateId: string | null;
  candidateKind: string | null;
  candidateBanId: string | null;
  resultId: string | null;
  checkId: string | null;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  shellKindBefore: string | null;
  actualKindBefore: string | null;
  effectiveKindBefore: string | null;
  shellCreated: boolean;
  shellKindAfter: string | null;
  skipReason: string | null;
  guardReason: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  renderBranch: string | null;
  lastRenderBranch: string | null;
  activeKind: string | null;
  incomingOverlayDisplayKind: string | null;
  activeOverlayKind: string | null;
  queueHeadKind: string | null;
  holdActive: boolean;
  isActiveUserCardHold: boolean;
  heldBanId: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  reason: 'overlay-queue-to-shell-decision';
};

let emittedSig = '';

function resolveCandidateFieldIds(head: QueuedOverlay | null): {
  candidateBanId: string | null;
  resultId: string | null;
  checkId: string | null;
} {
  if (!head) {
    return { candidateBanId: null, resultId: null, checkId: null };
  }
  if (head.kind === 'result') {
    return {
      candidateBanId: null,
      resultId: head.result.id ?? null,
      checkId: null,
    };
  }
  const banId = head.ban?.id ?? null;
  return {
    candidateBanId: banId,
    resultId: null,
    checkId: head.kind === 'check' ? banId : null,
  };
}

export function resolveOverlayShellCreateSkipReason(
  pipeline: OverlayShellCreateAttemptPipeline,
  overlayQueueLength: number,
  overlayCandidateKind: string | null,
): { skipReason: string | null; guardReason: string | null } {
  const shellAfter = pipeline.notificationQueueShellDisplayKindResolved;

  if (shellAfter != null) {
    return { skipReason: null, guardReason: null };
  }

  if (pipeline.composeBlocksNotificationHost) {
    return {
      skipReason: 'compose-blocks-notification-host',
      guardReason: 'composeBlocksNotificationHost',
    };
  }

  if (pipeline.checkAnswerWaitingResultHoldBanId) {
    if (pipeline.notificationQueueShellKind !== 'check') {
      return {
        skipReason: 'check-answer-waiting-hold-shell-kind-not-check',
        guardReason: 'checkAnswerWaitingResultHoldBanId',
      };
    }
    return {
      skipReason: 'check-answer-waiting-hold-display-still-null',
      guardReason: 'notificationQueueShellDisplayKind pipeline',
    };
  }

  if (pipeline.chainAdvanceWaiting) {
    if (!pipeline.ownerQueueHeadKind && overlayCandidateKind) {
      return {
        skipReason: 'chain-advance-owner-head-missing-overlay-candidate-ignored',
        guardReason: 'chainAdvanceWaiting+ownerPrimaryQueueHead',
      };
    }
    if (!pipeline.chainAdvancePlaceholderKind && !pipeline.ownerQueueHeadKind) {
      return {
        skipReason: 'chain-advance-no-placeholder-or-owner-head',
        guardReason: 'chainAdvanceWaiting',
      };
    }
  }

  if (
    overlayQueueLength > 0 &&
    overlayCandidateKind &&
    pipeline.ownerPrimaryShellQueueLen <= 0 &&
    pipeline.ownerPrimaryShellPendingLen <= 0 &&
    !pipeline.queueHeadShellKindFallback
  ) {
    return {
      skipReason: 'overlay-candidate-owner-shell-queue-empty-fallback-null',
      guardReason:
        'queueHeadShellKindFallback requires ownerPrimaryShellQueueLen>0',
    };
  }

  if (
    !pipeline.incomingNotificationShellKind &&
    !pipeline.queueHeadShellKindFallback
  ) {
    if (overlayQueueLength > 0 && overlayCandidateKind && !pipeline.ownerQueueHeadKind) {
      return {
        skipReason:
          'incoming-shell-null-owner-head-missing-overlay-candidate-not-read',
        guardReason: 'readOwnerOnlyQueueHead returns owner queue only',
      };
    }
    return {
      skipReason: 'incoming-notification-shell-kind-and-fallback-null',
      guardReason: 'incomingNotificationShellKind+queueHeadShellKindFallback',
    };
  }

  if (
    pipeline.notificationQueueShellKind == null &&
    pipeline.queueHeadShellKindFallback
  ) {
    return {
      skipReason: 'notification-shell-kind-null-despite-fallback',
      guardReason: 'notificationQueueShellKind blocked before fallback',
    };
  }

  if (
    pipeline.notificationQueueShellKind === 'incoming' &&
    pipeline.replyIncomingDirectPath
  ) {
    return {
      skipReason: 'reply-incoming-direct-path-nulls-shell',
      guardReason: 'replyIncomingDirectPath',
    };
  }

  if (pipeline.effectiveNotificationQueueShellKind == null) {
    if (pipeline.notificationQueueShellKind) {
      return {
        skipReason: 'effective-shell-null-despite-notification-shell-kind',
        guardReason: 'effectiveNotificationQueueShellKind',
      };
    }
    return {
      skipReason: 'effective-notification-queue-shell-kind-null',
      guardReason: 'effectiveNotificationQueueShellKind',
    };
  }

  if (pipeline.notificationQueueShellDisplayKind == null) {
    return {
      skipReason: 'display-shell-kind-null-effective-present',
      guardReason: 'notificationQueueShellDisplayKind',
    };
  }

  if (pipeline.checkShellKindWithoutBan) {
    return {
      skipReason: 'check-shell-kind-without-ban-id',
      guardReason: 'checkShellKindWithoutBan',
    };
  }

  if (
    pipeline.effectiveNotificationQueueShellKind === 'result' &&
    !pipeline.renderableResultShell
  ) {
    return {
      skipReason: 'result-shell-blocked-until-child-ready',
      guardReason: 'renderableResultShell',
    };
  }

  if (pipeline.showDirectOverboardLayer) {
    return {
      skipReason: 'direct-overboard-layer-active',
      guardReason: 'showDirectOverboardLayer',
    };
  }

  return { skipReason: 'unknown-shell-create-blocked', guardReason: null };
}

function shouldEmitOverlayShellCreateAttempt(input: {
  overlayQueueLength: number;
  candidateKind: string | null;
  shellKindBefore: string | null;
  actualKindBefore: string | null;
  effectiveKindBefore: string | null;
  pipeline: OverlayShellCreateAttemptPipeline;
}): boolean {
  if (input.overlayQueueLength <= 0 || input.candidateKind == null) {
    return false;
  }

  const shellKindsNull =
    input.shellKindBefore == null &&
    input.actualKindBefore == null &&
    input.effectiveKindBefore == null;

  const shellPipelineActive =
    input.pipeline.incomingNotificationShellKind != null ||
    input.pipeline.queueHeadShellKindFallback != null ||
    input.pipeline.notificationQueueShellKind != null ||
    input.pipeline.effectiveNotificationQueueShellKind != null ||
    input.pipeline.notificationQueueShellDisplayKind != null ||
    input.pipeline.notificationQueueShellDisplayKindResolved != null;

  return shellKindsNull || shellPipelineActive;
}

export function traceOverlayShellCreateAttemptIfChanged(input: {
  overlayCandidate: QueuedOverlay | null;
  overlayQueueLength: number;
  shellKindBefore: string | null;
  actualKindBefore: string | null;
  effectiveKindBefore: string | null;
  pipeline: OverlayShellCreateAttemptPipeline;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  renderBranch: string | null;
  activeKind: string | null;
  incomingOverlayDisplayKind: string | null;
  activeOverlayKind: string | null;
  queueHeadKind: string | null;
  holdActive: boolean;
  isActiveUserCardHold: boolean;
  heldBanId: string | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const candidateKind = input.overlayCandidate?.kind ?? null;
  if (
    !shouldEmitOverlayShellCreateAttempt({
      overlayQueueLength: input.overlayQueueLength,
      candidateKind,
      shellKindBefore: input.shellKindBefore,
      actualKindBefore: input.actualKindBefore,
      effectiveKindBefore: input.effectiveKindBefore,
      pipeline: input.pipeline,
    })
  ) {
    return;
  }

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();
  const fieldIds = resolveCandidateFieldIds(input.overlayCandidate);
  const { skipReason, guardReason } = resolveOverlayShellCreateSkipReason(
    input.pipeline,
    input.overlayQueueLength,
    candidateKind,
  );
  const shellKindAfter = input.pipeline.notificationQueueShellDisplayKindResolved;
  const shellCreated = shellKindAfter != null;

  const payload: OverlayShellCreateAttemptTrace = {
    timestamp: diagTraceNow(),
    candidateId: queueHeadIdFrom(input.overlayCandidate),
    candidateKind,
    candidateBanId: fieldIds.candidateBanId,
    resultId: fieldIds.resultId,
    checkId: fieldIds.checkId,
    overlayQueueLength: input.overlayQueueLength,
    overlayQueueHeadKind: candidateKind,
    overlayQueueHeadId: queueHeadIdFrom(input.overlayCandidate),
    shellKindBefore: input.shellKindBefore,
    actualKindBefore: input.actualKindBefore,
    effectiveKindBefore: input.effectiveKindBefore,
    shellCreated,
    shellKindAfter,
    skipReason,
    guardReason,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    backdropMounted: input.backdropMounted,
    renderBranch: input.renderBranch,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    activeKind: input.activeKind,
    incomingOverlayDisplayKind: input.incomingOverlayDisplayKind,
    activeOverlayKind: input.activeOverlayKind,
    queueHeadKind: input.queueHeadKind,
    holdActive: input.holdActive,
    isActiveUserCardHold: input.isActiveUserCardHold,
    heldBanId: input.heldBanId,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    reason: 'overlay-queue-to-shell-decision',
  };

  const sig = [
    payload.candidateId,
    payload.candidateKind,
    payload.overlayQueueLength,
    payload.shellKindBefore,
    payload.actualKindBefore,
    payload.effectiveKindBefore,
    payload.shellCreated,
    payload.shellKindAfter,
    payload.skipReason,
    payload.guardReason,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.backdropMounted,
    payload.renderBranch,
    payload.lastRenderBranch,
    payload.activeKind,
    payload.incomingOverlayDisplayKind,
    payload.activeOverlayKind,
    payload.queueHeadKind,
    payload.holdActive,
    payload.isActiveUserCardHold,
    payload.heldBanId,
    payload.lastOverlayQueueMutationOperation,
    payload.lastOverlayQueueMutationPrevHead,
    payload.lastOverlayQueueMutationNextHead,
    payload.lastOverlayQueueMutationNextLen,
    input.pipeline.incomingNotificationShellKind,
    input.pipeline.queueHeadShellKindFallback,
    input.pipeline.notificationQueueShellKind,
    input.pipeline.effectiveNotificationQueueShellKind,
    input.pipeline.ownerPrimaryShellQueueLen,
    input.pipeline.ownerPrimaryShellPendingLen,
    input.pipeline.ownerQueueHeadKind,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('OVERLAY_SHELL_CREATE_ATTEMPT', payload);
}
