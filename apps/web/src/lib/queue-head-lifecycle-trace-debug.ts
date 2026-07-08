'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueHeadLifecycleFramePhase =
  | 'before-layout'
  | 'layout'
  | 'after-layout'
  | 'read-site';

export type QueueHeadLifecycleReason =
  | 'queue-head-cleared'
  | 'queue-head-restored'
  | 'queue-head-kind-changed'
  | 'queue-head-id-changed';

export type QueueHeadLifecycleTrace = {
  timestamp: number;
  framePhase: QueueHeadLifecycleFramePhase;
  reason: QueueHeadLifecycleReason;
  previousQueueHeadKind: string | null;
  nextQueueHeadKind: string | null;
  previousHeadId: string | null;
  nextHeadId: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  displayQueueLength: number;
  mutationSource: string | null;
  mutationReason: string | null;
  renderBranch: string | null;
  shellKind: string | null;
  activeKind: string | null;
};

type QueueHeadMutationContext = {
  source: string;
  reason: string;
  operation?: string | null;
  at: number;
};

let mutationContext: QueueHeadMutationContext | null = null;
const nullReadSiteSigRef = { current: '' };

export function registerQueueHeadMutationContext(input: {
  source: string;
  reason: string;
  operation?: string | null;
}): void {
  mutationContext = {
    source: input.source,
    reason: input.reason,
    operation: input.operation ?? null,
    at: diagTraceNow(),
  };
}

export function readQueueHeadMutationContext(): QueueHeadMutationContext | null {
  return mutationContext;
}

export function queueHeadIdFrom(head: QueuedOverlay | null | undefined): string | null {
  if (!head) return null;
  const id = normalizeId(overlayBanId(head));
  return id || null;
}

export function resolveQueueHeadLifecycleReason(input: {
  previousQueueHeadKind: string | null;
  nextQueueHeadKind: string | null;
  previousHeadId: string | null;
  nextHeadId: string | null;
}): QueueHeadLifecycleReason {
  const prevKind = input.previousQueueHeadKind;
  const nextKind = input.nextQueueHeadKind;
  if (prevKind != null && nextKind == null) {
    return 'queue-head-cleared';
  }
  if (prevKind == null && nextKind != null) {
    return 'queue-head-restored';
  }
  if (prevKind !== nextKind) {
    return 'queue-head-kind-changed';
  }
  return 'queue-head-id-changed';
}

export function buildQueueHeadLifecycleSignature(input: {
  framePhase: QueueHeadLifecycleFramePhase;
  nextQueueHeadKind: string | null;
  nextHeadId: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  displayQueueLength: number;
  renderBranch: string | null;
  shellKind: string | null;
  activeKind: string | null;
}): string {
  return [
    input.framePhase,
    input.nextQueueHeadKind,
    input.nextHeadId,
    input.ownerQueueLen,
    input.ownerPendingLen,
    input.overlayQueueLength,
    input.displayQueueLength,
    input.renderBranch,
    input.shellKind,
    input.activeKind,
  ].join('|');
}

export function logQueueHeadLifecycleTrace(
  payload: Omit<QueueHeadLifecycleTrace, 'timestamp'>,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const entry: QueueHeadLifecycleTrace = {
    timestamp: diagTraceNow(),
    ...payload,
  };
  emitClientDiagTrace('QUEUE_HEAD_LIFECYCLE_TRACE', entry);
}

export function traceQueueHeadNullReadSite(input: {
  assignmentSite: string;
  selector: string;
  ownerQueueLen: number;
  ownerHeadPresent: boolean;
  ownerHeadRawKind: string | null;
  legacyHeadKind?: string | null;
  legacyQueueLen?: number;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const sig = [
    input.assignmentSite,
    input.selector,
    input.ownerQueueLen,
    input.ownerHeadPresent,
    input.ownerHeadRawKind,
    input.legacyHeadKind ?? null,
    input.legacyQueueLen ?? null,
  ].join('|');
  if (sig === nullReadSiteSigRef.current) return;
  nullReadSiteSigRef.current = sig;

  const mutation = readQueueHeadMutationContext();
  logQueueHeadLifecycleTrace({
    framePhase: 'read-site',
    reason: 'queue-head-cleared',
    previousQueueHeadKind: input.legacyHeadKind ?? input.ownerHeadRawKind,
    nextQueueHeadKind: null,
    previousHeadId: null,
    nextHeadId: null,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: 0,
    overlayQueueLength: input.legacyQueueLen ?? input.ownerQueueLen,
    displayQueueLength: input.ownerQueueLen,
    mutationSource: `${input.assignmentSite}:${input.selector}`,
    mutationReason:
      input.ownerHeadPresent && input.ownerHeadRawKind == null
        ? 'owner-queue-head-missing-kind'
        : !input.ownerHeadPresent && input.ownerQueueLen > 0
          ? 'owner-queue-len-positive-but-head-missing'
          : 'owner-shell-queue-head-kind-null',
    renderBranch: null,
    shellKind: null,
    activeKind: null,
  });
}
