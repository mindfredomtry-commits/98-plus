'use client';

import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type PendingPromotionDecisionTracePayload = {
  source: string;
  inputPendingLen: number;
  outputPendingLen: number;
  inputQueueLen: number;
  outputQueueLen: number;
  promotedCount?: number | null;
  promotedHeadKind?: string | null;
  promotedHeadId?: string | null;
  skippedReason?: string | null;
  authReady?: boolean;
  sessionActive?: boolean;
  currentOverlayKind?: string | null;
  activeKind?: string | null;
  displayKind?: string | null;
  ownerPendingLen?: number;
  ownerQueueLen?: number;
  runtimePendingLen?: number;
  runtimeQueueLen?: number;
  queueLocked?: boolean;
  mountedOverlayKind?: string | null;
  goToBansAdvancePending?: boolean;
  goToBansClosingBanId?: string | null;
  timestamp?: number;
};

export function logPendingPromotionDecisionTrace(
  data: PendingPromotionDecisionTracePayload,
): void {
  emit('PENDING_PROMOTION_DECISION_TRACE', data);
}

export type ResultGoToBansPendingNotPromotedPayload = {
  reason: string;
  overlayQueueLen: number;
  pendingStartupLen: number;
  displayKind: string | null;
  activeKind: string | null;
  notificationOverlayVisible: boolean;
  goToBansAdvancePending: boolean;
  goToBansClosingBanId: string | null;
  ownerPendingLen: number;
  ownerQueueLen: number;
  runtimePendingLen: number;
  runtimeQueueLen: number;
  previousKind: string | null;
  previousAction: string | null;
  lastContinueOutcome: string | null;
  lastMergeSkippedReason: string | null;
  currentOverlayKind: string | null;
  mountedOverlayKind: string | null;
  timestamp?: number;
};

export function logResultGoToBansPendingNotPromoted(
  data: ResultGoToBansPendingNotPromotedPayload,
): void {
  emit('RESULT_GO_TO_BANS_PENDING_NOT_PROMOTED', data);
}

export type ContinueChainEmptyButPendingExistsPayload = {
  source: string;
  outcome: string;
  emptyReason: string;
  runtimeQueueLen: number;
  runtimePendingLen: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  usedRuntimeRefs: boolean;
  willRetry: boolean;
  willPrefetch: boolean;
  willOpenLobby: boolean;
  currentOverlayKind: string | null;
  activeKind: string | null;
  displayKind: string | null;
  mountedOverlayKind: string | null;
  goToBansAdvancePending: boolean;
  goToBansClosingBanId: string | null;
  timestamp?: number;
};

export function logContinueChainEmptyButPendingExists(
  data: ContinueChainEmptyButPendingExistsPayload,
): void {
  emit('CONTINUE_CHAIN_EMPTY_BUT_PENDING_EXISTS', data);
}

export function resolvePendingHeadFields(head: QueuedOverlay | null): {
  pendingHeadKind: string | null;
  pendingHeadBanId: string | null;
  pendingHeadResultId: string | null;
  pendingHeadKey: string | null;
} {
  if (!head) {
    return {
      pendingHeadKind: null,
      pendingHeadBanId: null,
      pendingHeadResultId: null,
      pendingHeadKey: null,
    };
  }
  const pendingHeadBanId =
    head.kind === 'incoming' || head.kind === 'check' ? head.ban.id : null;
  const pendingHeadResultId = head.kind === 'result' ? head.result.id : null;
  return {
    pendingHeadKind: head.kind,
    pendingHeadBanId,
    pendingHeadResultId,
    pendingHeadKey: overlayQueueKey(head),
  };
}

export type PendingChainQueuedSkipTracePayload = {
  source: string;
  caller: string;
  pendingHeadKind: string | null;
  pendingHeadBanId: string | null;
  pendingHeadResultId: string | null;
  pendingHeadKey: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  legacyQueueLen: number;
  legacyPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  pendingNotPromotedReason: string;
  lastMergeSkipReason: string | null;
  lastMergeSkipSource: string | null;
  lastContinueOutcome: string | null;
  goToBansAdvancePending: boolean;
  startupHold: boolean;
  skipReason: 'pending-chain-queued';
  timestamp?: number;
};

export function inferPendingNotPromotedReason(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  runtimeQueueLen: number;
  runtimePendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  startupHold: boolean;
  mergeSkip: { source: string; skipReason: string } | null;
  lastContinue: { outcome: string; reason: string } | null;
  goToBansAdvancePending: boolean;
}): string {
  if (input.ownerQueueLen > 0) {
    return 'queue-not-empty-promotion-deferred';
  }
  if (input.ownerPendingLen === 0) {
    return 'no-owner-pending';
  }
  if (input.startupHold) {
    return 'startup-hold-still-active';
  }
  if (input.mergeSkip?.skipReason) {
    return `merge-skipped:${input.mergeSkip.skipReason}`;
  }
  if (input.activeKind != null || input.displayKind != null) {
    return 'active-display-present-blocks-merge';
  }
  if (input.lastContinue && input.lastContinue.outcome !== 'show-next') {
    return `continue-outcome:${input.lastContinue.outcome}:${input.lastContinue.reason}`;
  }
  if (input.goToBansAdvancePending) {
    return 'go-to-bans-advance-pending-awaiting-async-continue';
  }
  if (input.ownerPendingLen > 0 && input.runtimePendingLen === 0) {
    return 'owner-pending-not-mirrored-to-runtime-ref';
  }
  if (
    input.ownerPendingLen > 0 &&
    input.runtimeQueueLen === 0 &&
    input.runtimePendingLen > 0
  ) {
    return 'runtime-pending-not-promoted-to-queue';
  }
  return 'unknown-no-promotion-reason';
}

export function logPendingChainQueuedSkipTrace(
  data: PendingChainQueuedSkipTracePayload,
): void {
  emit('PENDING_CHAIN_QUEUED_SKIP_TRACE', data);
}

export function buildGoToBansPendingNotPromotedSignature(
  data: ResultGoToBansPendingNotPromotedPayload,
): string {
  return [
    data.reason,
    data.goToBansClosingBanId ?? '',
    data.runtimePendingLen,
    data.ownerPendingLen,
    data.lastContinueOutcome ?? '',
    data.lastMergeSkippedReason ?? '',
    data.goToBansAdvancePending ? '1' : '0',
  ].join('|');
}

export function formatLastContinueOutcome(
  last: { outcome: string; reason: string } | null,
): string | null {
  if (!last) return null;
  return `${last.outcome}:${last.reason}`;
}

export type OwnerPendingPromotionDecisionStage =
  | 'before-promotion'
  | 'promoted'
  | 'skipped-queue-not-empty'
  | 'skipped-no-pending'
  | 'skipped-active-display-present';

export type OwnerPendingPromotionDecisionPayload = {
  stage: OwnerPendingPromotionDecisionStage;
  ownerPendingLenBefore: number;
  ownerQueueLenBefore: number;
  ownerPendingLenAfter: number;
  ownerQueueLenAfter: number;
  legacyPendingLen: number;
  legacyQueueLen: number;
  promotedCount: number;
  promotedHeadKind: string | null;
  activeKind: string | null;
  displayKind: string | null;
  skipReason: string | null;
  decisionSource: 'owner';
  timestamp?: number;
};

export function logOwnerPendingPromotionDecision(
  data: OwnerPendingPromotionDecisionPayload,
): void {
  emit('OWNER_PENDING_PROMOTION_DECISION', data);
}
