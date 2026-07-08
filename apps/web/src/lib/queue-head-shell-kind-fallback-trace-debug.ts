'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import {
  resolveOverlayShellCreateSkipReason,
  type OverlayShellCreateAttemptPipeline,
} from '@/lib/overlay-shell-create-attempt-trace-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueHeadShellKindFallbackDecisionPath =
  | 'compose-blocks-notification-host'
  | 'owner-primary-shell-queue-len-and-pending-len-both-zero'
  | 'owner-primary-queue-head-missing'
  | 'owner-primary-queue-head-kind-unrecognized'
  | 'owner-primary-queue-head-kind-returned';

export type QueueHeadShellKindFallbackTrace = {
  timestamp: number;
  overlayQueueLength: number;
  overlayQueueHeadId: string | null;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadBanId: string | null;
  resultId: string | null;
  checkId: string | null;
  ownerQueueLength: number;
  ownerPendingLength: number;
  ownerPrimaryShellQueueLength: number;
  ownerPrimaryShellQueueHeadKind: string | null;
  ownerPrimaryShellQueueHeadId: string | null;
  queueHeadKind: string | null;
  queueHeadShellKindFallback: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  incomingNotificationShellKind: string | null;
  incomingOverlayDisplayKind: string | null;
  activeKind: string | null;
  activeOverlayKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
  lastRenderBranch: string | null;
  shellCreated: boolean;
  skipReason: string | null;
  guardReason: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  exactDecisionPath: string;
  ignoredOverlayCandidate: boolean;
  ignoredOverlayCandidateReason: string | null;
  reason: 'queue-head-shell-kind-fallback-evaluated';
};

let emittedSig = '';

function resolveOverlayHeadFieldIds(head: QueuedOverlay | null): {
  overlayQueueHeadBanId: string | null;
  resultId: string | null;
  checkId: string | null;
} {
  if (!head) {
    return { overlayQueueHeadBanId: null, resultId: null, checkId: null };
  }
  if (head.kind === 'result') {
    return {
      overlayQueueHeadBanId: null,
      resultId: head.result.id ?? null,
      checkId: null,
    };
  }
  const banId = head.ban?.id ?? null;
  return {
    overlayQueueHeadBanId: banId,
    resultId: null,
    checkId: head.kind === 'check' ? banId : null,
  };
}

/** Mirrors queueHeadShellKindFallback useMemo branches in Providers. */
export function resolveQueueHeadShellKindFallbackDecisionPath(input: {
  composeBlocksNotificationHost: boolean;
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
  ownerPrimaryQueueHeadKind: string | null;
}): {
  exactDecisionPath: QueueHeadShellKindFallbackDecisionPath | string;
  fallbackKind: string | null;
} {
  if (input.composeBlocksNotificationHost) {
    return {
      exactDecisionPath: 'compose-blocks-notification-host',
      fallbackKind: null,
    };
  }
  if (
    input.ownerPrimaryShellQueueLen <= 0 &&
    input.ownerPrimaryShellPendingLen <= 0
  ) {
    return {
      exactDecisionPath: 'owner-primary-shell-queue-len-and-pending-len-both-zero',
      fallbackKind: null,
    };
  }
  const headKind = input.ownerPrimaryQueueHeadKind;
  if (!headKind) {
    return {
      exactDecisionPath: 'owner-primary-queue-head-missing',
      fallbackKind: null,
    };
  }
  if (
    headKind === 'check' ||
    headKind === 'incoming' ||
    headKind === 'result'
  ) {
    return {
      exactDecisionPath: `owner-primary-queue-head-kind-returned:${headKind}`,
      fallbackKind: headKind,
    };
  }
  return {
    exactDecisionPath: 'owner-primary-queue-head-kind-unrecognized',
    fallbackKind: null,
  };
}

function resolveIgnoredOverlayCandidateReason(input: {
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  queueHeadShellKindFallback: string | null;
  exactDecisionPath: string;
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
  ownerPrimaryQueueHeadKind: string | null;
  legacyOverlayQueueHeadKind: string | null;
}): { ignored: boolean; reason: string | null } {
  const overlayPresent =
    input.overlayQueueLength > 0 && input.overlayQueueHeadKind != null;
  if (!overlayPresent || input.queueHeadShellKindFallback != null) {
    return { ignored: false, reason: null };
  }

  if (
    input.exactDecisionPath ===
    'owner-primary-shell-queue-len-and-pending-len-both-zero'
  ) {
    return {
      ignored: true,
      reason:
        'queueHeadShellKindFallback requires ownerPrimaryShellQueueLen>0 or ownerPrimaryShellPendingLen>0; readOwnerOnlyShellQueueLen uses owner queue length only, not overlayQueue',
    };
  }

  if (input.exactDecisionPath === 'owner-primary-queue-head-missing') {
    if (input.legacyOverlayQueueHeadKind) {
      return {
        ignored: true,
        reason:
          'fallback reads ownerPrimaryQueueHead from owner queue only; overlayQueue head present but not used (PHASE11B6 legacy logged only)',
      };
    }
    return {
      ignored: true,
      reason: 'fallback reads ownerPrimaryQueueHead; owner queue head missing',
    };
  }

  if (overlayPresent) {
    return {
      ignored: true,
      reason: `overlay candidate present but fallback path=${input.exactDecisionPath}`,
    };
  }

  return { ignored: false, reason: null };
}

function shouldEmitQueueHeadShellKindFallbackTrace(input: {
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  ownerQueueLength: number;
  ownerPrimaryShellQueueLength: number;
  queueHeadShellKindFallback: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  skipReason: string | null;
}): boolean {
  if (input.overlayQueueLength <= 0) return false;
  if (input.overlayQueueHeadKind == null) return false;
  if (input.ownerQueueLength > 0 && input.ownerPrimaryShellQueueLength > 0) {
    return false;
  }
  if (input.queueHeadShellKindFallback != null) return false;

  const shellKindsNull =
    input.shellKind == null && input.effectiveKind == null;
  const skipMatch = input.skipReason?.includes(
    'overlay-candidate-owner-shell-queue-empty-fallback-null',
  );
  return shellKindsNull || skipMatch === true;
}

export function traceQueueHeadShellKindFallbackIfChanged(input: {
  overlayQueueHead: QueuedOverlay | null;
  overlayQueueLength: number;
  legacyOverlayQueueHeadKind: string | null;
  ownerQueueLength: number;
  ownerPendingLength: number;
  ownerPrimaryShellQueueLength: number;
  ownerPrimaryShellQueueHeadKind: string | null;
  ownerPrimaryQueueHead: QueuedOverlay | null;
  queueHeadKind: string | null;
  queueHeadShellKindFallback: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  incomingNotificationShellKind: string | null;
  incomingOverlayDisplayKind: string | null;
  activeKind: string | null;
  activeOverlayKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
  shellKind: string | null;
  pipeline: OverlayShellCreateAttemptPipeline;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const overlayQueueHeadKind = input.overlayQueueHead?.kind ?? null;
  const { skipReason, guardReason } = resolveOverlayShellCreateSkipReason(
    input.pipeline,
    input.overlayQueueLength,
    overlayQueueHeadKind,
  );

  if (
    !shouldEmitQueueHeadShellKindFallbackTrace({
      overlayQueueLength: input.overlayQueueLength,
      overlayQueueHeadKind,
      ownerQueueLength: input.ownerQueueLength,
      ownerPrimaryShellQueueLength: input.ownerPrimaryShellQueueLength,
      queueHeadShellKindFallback: input.queueHeadShellKindFallback,
      shellKind: input.shellKind,
      effectiveKind: input.effectiveKind,
      skipReason,
    })
  ) {
    return;
  }

  const ownerPrimaryQueueHeadKind = input.ownerPrimaryQueueHead?.kind ?? null;
  const { exactDecisionPath } = resolveQueueHeadShellKindFallbackDecisionPath({
    composeBlocksNotificationHost: input.pipeline.composeBlocksNotificationHost,
    ownerPrimaryShellQueueLen: input.pipeline.ownerPrimaryShellQueueLen,
    ownerPrimaryShellPendingLen: input.pipeline.ownerPrimaryShellPendingLen,
    ownerPrimaryQueueHeadKind,
  });

  const ignored = resolveIgnoredOverlayCandidateReason({
    overlayQueueLength: input.overlayQueueLength,
    overlayQueueHeadKind,
    queueHeadShellKindFallback: input.queueHeadShellKindFallback,
    exactDecisionPath,
    ownerPrimaryShellQueueLen: input.pipeline.ownerPrimaryShellQueueLen,
    ownerPrimaryShellPendingLen: input.pipeline.ownerPrimaryShellPendingLen,
    ownerPrimaryQueueHeadKind,
    legacyOverlayQueueHeadKind: input.legacyOverlayQueueHeadKind,
  });

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();
  const headIds = resolveOverlayHeadFieldIds(input.overlayQueueHead);
  const shellCreated = input.shellKind != null;

  const payload: QueueHeadShellKindFallbackTrace = {
    timestamp: diagTraceNow(),
    overlayQueueLength: input.overlayQueueLength,
    overlayQueueHeadId: queueHeadIdFrom(input.overlayQueueHead),
    overlayQueueHeadKind,
    overlayQueueHeadBanId: headIds.overlayQueueHeadBanId,
    resultId: headIds.resultId,
    checkId: headIds.checkId,
    ownerQueueLength: input.ownerQueueLength,
    ownerPendingLength: input.ownerPendingLength,
    ownerPrimaryShellQueueLength: input.ownerPrimaryShellQueueLength,
    ownerPrimaryShellQueueHeadKind: input.ownerPrimaryShellQueueHeadKind,
    ownerPrimaryShellQueueHeadId: queueHeadIdFrom(input.ownerPrimaryQueueHead),
    queueHeadKind: input.queueHeadKind,
    queueHeadShellKindFallback: input.queueHeadShellKindFallback,
    notificationQueueShellKind: input.notificationQueueShellKind,
    effectiveNotificationQueueShellKind: input.effectiveNotificationQueueShellKind,
    incomingNotificationShellKind: input.incomingNotificationShellKind,
    incomingOverlayDisplayKind: input.incomingOverlayDisplayKind,
    activeKind: input.activeKind,
    activeOverlayKind: input.activeOverlayKind,
    actualKind: input.actualKind,
    effectiveKind: input.effectiveKind,
    renderBranch: input.renderBranch,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    shellCreated,
    skipReason,
    guardReason,
    lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    exactDecisionPath,
    ignoredOverlayCandidate: ignored.ignored,
    ignoredOverlayCandidateReason: ignored.reason,
    reason: 'queue-head-shell-kind-fallback-evaluated',
  };

  const sig = [
    payload.overlayQueueLength,
    payload.overlayQueueHeadId,
    payload.overlayQueueHeadKind,
    payload.ownerQueueLength,
    payload.ownerPendingLength,
    payload.ownerPrimaryShellQueueLength,
    payload.ownerPrimaryShellQueueHeadKind,
    payload.ownerPrimaryShellQueueHeadId,
    payload.queueHeadKind,
    payload.queueHeadShellKindFallback,
    payload.notificationQueueShellKind,
    payload.effectiveNotificationQueueShellKind,
    payload.incomingNotificationShellKind,
    payload.incomingOverlayDisplayKind,
    payload.activeKind,
    payload.activeOverlayKind,
    payload.actualKind,
    payload.effectiveKind,
    payload.renderBranch,
    payload.lastRenderBranch,
    payload.shellCreated,
    payload.skipReason,
    payload.guardReason,
    payload.exactDecisionPath,
    payload.ignoredOverlayCandidate,
    payload.ignoredOverlayCandidateReason,
    payload.lastOverlayQueueMutationOperation,
    payload.lastOverlayQueueMutationPrevHead,
    payload.lastOverlayQueueMutationNextHead,
    payload.lastOverlayQueueMutationNextLen,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('QUEUE_HEAD_SHELL_KIND_FALLBACK_TRACE', payload);
}
