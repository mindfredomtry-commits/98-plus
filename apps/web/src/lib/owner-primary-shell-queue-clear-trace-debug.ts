'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { getLastOwnerQueueMutationSnapshot } from '@/lib/owner-queue-population-trace';
import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OwnerPrimaryShellQueueClearSnapshot = {
  len: number;
  headKind: string | null;
  headId: string | null;
};

export type OwnerPrimaryShellQueueClearTrace = {
  timestamp: number;
  prevOwnerPrimaryShellQueueLen: number;
  nextOwnerPrimaryShellQueueLen: number;
  prevOwnerPrimaryShellQueueHeadKind: string | null;
  nextOwnerPrimaryShellQueueHeadKind: string | null;
  prevOwnerPrimaryShellQueueHeadId: string | null;
  nextOwnerPrimaryShellQueueHeadId: string | null;
  ownerQueueLength: number;
  ownerPendingLength: number;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  notificationQueueShellKind: string | null;
  queueHeadShellKindFallback: string | null;
  effectiveNotificationQueueShellKind: string | null;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
  lastRenderBranch: string | null;
  lastOverlayQueueMutationOperation: string | null;
  lastOverlayQueueMutationPrevHead: string | null;
  lastOverlayQueueMutationNextHead: string | null;
  lastOverlayQueueMutationNextLen: number | null;
  ownerQueueMutationReason: string | null;
  exactClearReason: string;
  clearedWhileOverlayCandidateExists: boolean;
  reason: 'owner-primary-shell-queue-cleared';
};

let emittedTransitionSig = '';

function shouldEmitOwnerPrimaryShellQueueClear(input: {
  prev: OwnerPrimaryShellQueueClearSnapshot;
  next: OwnerPrimaryShellQueueClearSnapshot;
}): boolean {
  const lenCleared = input.prev.len > 0 && input.next.len === 0;
  const headCleared =
    input.prev.headKind != null && input.next.headKind == null;
  return lenCleared || headCleared;
}

export function resolveOwnerPrimaryShellQueueExactClearReason(input: {
  prev: OwnerPrimaryShellQueueClearSnapshot;
  next: OwnerPrimaryShellQueueClearSnapshot;
  ownerQueueMutationReason: string | null;
  lastOverlayQueueMutationOperation: string | null;
  clearedWhileOverlayCandidateExists: boolean;
}): string {
  const lenCleared = input.prev.len > 0 && input.next.len === 0;
  const headCleared =
    input.prev.headKind != null && input.next.headKind == null;

  if (lenCleared && headCleared) {
    if (input.ownerQueueMutationReason) {
      return `owner-primary-shell-queue-len-and-head-cleared:owner-mutation:${input.ownerQueueMutationReason}`;
    }
    return 'owner-primary-shell-queue-len-and-head-both-cleared';
  }

  if (lenCleared) {
    if (input.clearedWhileOverlayCandidateExists) {
      if (input.lastOverlayQueueMutationOperation) {
        return `owner-primary-shell-queue-len-to-zero-while-overlay-candidate-exists:after-overlay-mutation:${input.lastOverlayQueueMutationOperation}`;
      }
      if (input.ownerQueueMutationReason) {
        return `owner-primary-shell-queue-len-to-zero-while-overlay-candidate-exists:owner-mutation:${input.ownerQueueMutationReason}`;
      }
      return 'owner-primary-shell-queue-len-to-zero-while-overlay-candidate-exists';
    }
    if (input.ownerQueueMutationReason) {
      return `owner-primary-shell-queue-len-to-zero:owner-mutation:${input.ownerQueueMutationReason}`;
    }
    if (input.lastOverlayQueueMutationOperation) {
      return `owner-primary-shell-queue-len-to-zero:after-overlay-mutation:${input.lastOverlayQueueMutationOperation}`;
    }
    return 'owner-primary-shell-queue-len-to-zero';
  }

  if (headCleared) {
    if (input.ownerQueueMutationReason) {
      return `owner-primary-shell-queue-head-kind-cleared:owner-mutation:${input.ownerQueueMutationReason}`;
    }
    if (input.lastOverlayQueueMutationOperation) {
      return `owner-primary-shell-queue-head-kind-cleared:after-overlay-mutation:${input.lastOverlayQueueMutationOperation}`;
    }
    return 'owner-primary-shell-queue-head-kind-cleared';
  }

  return 'unknown-owner-primary-shell-queue-clear';
}

export function traceOwnerPrimaryShellQueueClearIfTransition(input: {
  prev: OwnerPrimaryShellQueueClearSnapshot | null;
  next: OwnerPrimaryShellQueueClearSnapshot;
  ownerPrimaryQueueHead: QueuedOverlay | null;
  overlayQueueHead: QueuedOverlay | null;
  overlayQueueLength: number;
  ownerQueueLength: number;
  ownerPendingLength: number;
  notificationQueueShellKind: string | null;
  queueHeadShellKindFallback: string | null;
  effectiveNotificationQueueShellKind: string | null;
  shellKind: string | null;
  actualKind: string | null;
  effectiveKind: string | null;
  renderBranch: string | null;
}): OwnerPrimaryShellQueueClearSnapshot {
  const nextSnapshot = input.next;

  if (!isClientDiagTraceEnvironment() || input.prev == null) {
    return nextSnapshot;
  }

  if (!shouldEmitOwnerPrimaryShellQueueClear({ prev: input.prev, next: input.next })) {
    return nextSnapshot;
  }

  const overlayQueueHeadKind = input.overlayQueueHead?.kind ?? null;
  const clearedWhileOverlayCandidateExists =
    input.overlayQueueLength > 0 && overlayQueueHeadKind != null;

  const ownerMutation = getLastOwnerQueueMutationSnapshot();
  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const renderBranchSnapshot = getLastRenderBranchSnapshot();
  const ownerQueueMutationReason = ownerMutation?.reason ?? null;
  const lastOverlayQueueMutationOperation =
    overlayMutation?.operation ?? null;

  const exactClearReason = resolveOwnerPrimaryShellQueueExactClearReason({
    prev: input.prev,
    next: input.next,
    ownerQueueMutationReason,
    lastOverlayQueueMutationOperation,
    clearedWhileOverlayCandidateExists,
  });

  const transitionSig = [
    input.prev.len,
    input.next.len,
    input.prev.headKind,
    input.next.headKind,
    input.prev.headId,
    input.next.headId,
  ].join('|');
  if (emittedTransitionSig === transitionSig) {
    return nextSnapshot;
  }
  emittedTransitionSig = transitionSig;

  const payload: OwnerPrimaryShellQueueClearTrace = {
    timestamp: diagTraceNow(),
    prevOwnerPrimaryShellQueueLen: input.prev.len,
    nextOwnerPrimaryShellQueueLen: input.next.len,
    prevOwnerPrimaryShellQueueHeadKind: input.prev.headKind,
    nextOwnerPrimaryShellQueueHeadKind: input.next.headKind,
    prevOwnerPrimaryShellQueueHeadId: input.prev.headId,
    nextOwnerPrimaryShellQueueHeadId: input.next.headId,
    ownerQueueLength: input.ownerQueueLength,
    ownerPendingLength: input.ownerPendingLength,
    overlayQueueLength: input.overlayQueueLength,
    overlayQueueHeadKind,
    overlayQueueHeadId: queueHeadIdFrom(input.overlayQueueHead),
    notificationQueueShellKind: input.notificationQueueShellKind,
    queueHeadShellKindFallback: input.queueHeadShellKindFallback,
    effectiveNotificationQueueShellKind: input.effectiveNotificationQueueShellKind,
    shellKind: input.shellKind,
    actualKind: input.actualKind,
    effectiveKind: input.effectiveKind,
    renderBranch: input.renderBranch,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    lastOverlayQueueMutationOperation,
    lastOverlayQueueMutationPrevHead: overlayMutation?.prevHead ?? null,
    lastOverlayQueueMutationNextHead: overlayMutation?.nextHead ?? null,
    lastOverlayQueueMutationNextLen: overlayMutation?.nextLen ?? null,
    ownerQueueMutationReason,
    exactClearReason,
    clearedWhileOverlayCandidateExists,
    reason: 'owner-primary-shell-queue-cleared',
  };

  emitClientDiagTrace('OWNER_PRIMARY_SHELL_QUEUE_CLEAR_TRACE', payload);
  return nextSnapshot;
}
