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
  pendingHeadKey: string | null;
} {
  if (!head) {
    return {
      pendingHeadKind: null,
      pendingHeadBanId: null,
      pendingHeadKey: null,
    };
  }
  const pendingHeadBanId =
    head.kind === 'result'
      ? head.result.id
      : head.kind === 'incoming' || head.kind === 'check'
        ? head.ban.id
        : null;
  return {
    pendingHeadKind: head.kind,
    pendingHeadBanId,
    pendingHeadKey: overlayQueueKey(head),
  };
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
