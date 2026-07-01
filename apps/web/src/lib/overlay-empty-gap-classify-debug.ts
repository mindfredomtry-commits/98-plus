'use client';

import { resolveOverboardResultOutcome } from '@/lib/overboard-result-chain';
import {
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';

export type OverlayEmptyGapClassification =
  | 'allowed-api-gap-before-result-status'
  | 'bug-local-next-payload-not-committed'
  | 'unknown-empty-gap';

export type OverlayEmptyGapClassifyInput = {
  previousKind: string | null;
  previousAction: string | null;
  runtimeQueueLen: number;
  runtimePendingLen: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  queueHeadKey: string | null;
  displayKind: string | null;
  activeKind: string | null;
  waitingForApi: boolean;
  waitingForPoll: boolean;
  waitingForPrefetch: boolean;
  notificationOverlayVisible: boolean;
  hasRenderableCard: boolean;
  goToBansAdvancePending: boolean;
  chainAdvanceWaiting: boolean;
  notificationChainTransitioning: boolean;
  checkAnswerWaitingResultHoldBanId: string | null;
  chainAdvancePlaceholderKind: string | null;
  shellKind: string | null;
  effectiveShellKind: string | null;
  queueHead: QueuedOverlay | null;
  incomingOverboardInFlight: boolean;
  incomingOverboardAtomicBanId: string | null;
};

export type OverlayEmptyGapClassifiedPayload = {
  previousKind: string | null;
  previousAction: string | null;
  nextQueueLen: number;
  nextPendingLen: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  queueHeadKey: string | null;
  displayKind: string | null;
  activeKind: string | null;
  waitingForApi: boolean;
  waitingForPoll: boolean;
  waitingForPrefetch: boolean;
  classification: OverlayEmptyGapClassification;
  blockerReason?: string;
  guardName?: string;
  source?: string;
};

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOverlayEmptyGapClassified(
  data: OverlayEmptyGapClassifiedPayload,
): void {
  emit('OVERLAY_EMPTY_GAP_CLASSIFIED', data);
}

function isQueueHeadLocallyCommittable(head: QueuedOverlay | null): boolean {
  if (!head) return false;
  if (head.kind === 'incoming' || head.kind === 'check') {
    return Boolean(head.ban?.id?.trim());
  }
  if (head.kind === 'result') {
    return Boolean(resolveOverboardResultOutcome(head.result));
  }
  return false;
}

function hasLocalQueueItems(input: OverlayEmptyGapClassifyInput): boolean {
  return (
    input.runtimeQueueLen > 0 ||
    input.runtimePendingLen > 0 ||
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0
  );
}

function isWaitingForResultStatusAfterUserAction(
  input: OverlayEmptyGapClassifyInput,
): boolean {
  if (input.checkAnswerWaitingResultHoldBanId) {
    return true;
  }
  if (input.incomingOverboardInFlight || input.incomingOverboardAtomicBanId) {
    return true;
  }
  const expectsResultShell =
    input.chainAdvancePlaceholderKind === 'result' ||
    input.shellKind === 'result' ||
    input.effectiveShellKind === 'result' ||
    input.queueHeadKind === 'result';
  if (
    expectsResultShell &&
    (input.waitingForApi || input.waitingForPoll) &&
    !isQueueHeadLocallyCommittable(
      input.queueHead?.kind === 'incoming' || input.queueHead?.kind === 'check'
        ? input.queueHead
        : null,
    )
  ) {
    return true;
  }
  return false;
}

function resolvePreviousTransition(
  input: OverlayEmptyGapClassifyInput,
): { previousKind: string | null; previousAction: string | null } {
  if (input.goToBansAdvancePending) {
    return { previousKind: 'result', previousAction: 'go-to-bans' };
  }
  if (input.checkAnswerWaitingResultHoldBanId) {
    return { previousKind: 'check', previousAction: 'check-answer' };
  }
  if (input.incomingOverboardInFlight || input.incomingOverboardAtomicBanId) {
    return { previousKind: 'incoming', previousAction: 'incoming-overboard' };
  }
  if (input.chainAdvancePlaceholderKind) {
    return {
      previousKind: input.chainAdvancePlaceholderKind,
      previousAction: 'chain-advance',
    };
  }
  return { previousKind: null, previousAction: null };
}

function resolveBugBlocker(input: OverlayEmptyGapClassifyInput): {
  blockerReason: string;
  guardName: string;
  source: string;
} {
  if (input.goToBansAdvancePending) {
    return {
      blockerReason: 'runtime-empty-deferred-to-async-continue',
      guardName: 'goToBansAdvancePendingRef',
      source: 'finalizeResultForGoToBans-defer',
    };
  }
  if (
    input.notificationChainTransitioning &&
    !input.hasRenderableCard &&
    hasLocalQueueItems(input)
  ) {
    return {
      blockerReason: 'chain-transitioning-without-renderable-card',
      guardName: 'notificationOverlayVisible',
      source: 'providers-host',
    };
  }
  if (input.chainAdvanceWaiting && !input.hasRenderableCard) {
    return {
      blockerReason: 'chain-advance-waiting-without-renderable-card',
      guardName: 'chainAdvanceWaiting',
      source: 'providers-host',
    };
  }
  if (input.waitingForPrefetch) {
    return {
      blockerReason: 'prefetch-in-flight-before-show-next',
      guardName: 'pendingChainPrefetchInFlightRef',
      source: 'continueNotificationChainOrOpenLobby',
    };
  }
  return {
    blockerReason: 'local-head-not-committed-to-display',
    guardName: 'unknown',
    source: 'overlay-empty-gap-classify',
  };
}

export function classifyOverlayEmptyGap(
  input: OverlayEmptyGapClassifyInput,
): OverlayEmptyGapClassifiedPayload {
  const { previousKind, previousAction } = resolvePreviousTransition(input);
  const headLocallyCommittable = isQueueHeadLocallyCommittable(input.queueHead);
  const localItems = hasLocalQueueItems(input);

  let classification: OverlayEmptyGapClassification = 'unknown-empty-gap';

  if (
    isWaitingForResultStatusAfterUserAction(input) &&
    !(
      headLocallyCommittable &&
      (input.queueHead?.kind === 'incoming' ||
        input.queueHead?.kind === 'check')
    )
  ) {
    classification = 'allowed-api-gap-before-result-status';
  } else if (
    localItems &&
    headLocallyCommittable &&
    !input.hasRenderableCard
  ) {
    classification = 'bug-local-next-payload-not-committed';
  } else if (
    localItems &&
    (input.queueHead?.kind === 'incoming' ||
      input.queueHead?.kind === 'check') &&
    !input.hasRenderableCard &&
    !input.checkAnswerWaitingResultHoldBanId
  ) {
    classification = 'bug-local-next-payload-not-committed';
  }

  const payload: OverlayEmptyGapClassifiedPayload = {
    previousKind,
    previousAction,
    nextQueueLen: input.runtimeQueueLen,
    nextPendingLen: input.runtimePendingLen,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    queueHeadKind: input.queueHeadKind,
    queueHeadKey: input.queueHeadKey,
    displayKind: input.displayKind,
    activeKind: input.activeKind,
    waitingForApi: input.waitingForApi,
    waitingForPoll: input.waitingForPoll,
    waitingForPrefetch: input.waitingForPrefetch,
    classification,
  };

  if (classification === 'bug-local-next-payload-not-committed') {
    const blocker = resolveBugBlocker(input);
    payload.blockerReason = blocker.blockerReason;
    payload.guardName = blocker.guardName;
    payload.source = blocker.source;
  }

  return payload;
}

export function buildOverlayEmptyGapSignature(
  payload: OverlayEmptyGapClassifiedPayload,
): string {
  return [
    payload.classification,
    payload.previousKind ?? '',
    payload.previousAction ?? '',
    payload.queueHeadKey ?? '',
    payload.blockerReason ?? '',
    payload.nextQueueLen,
    payload.ownerQueueLen,
    payload.waitingForApi ? 'api' : '',
    payload.waitingForPoll ? 'poll' : '',
    payload.waitingForPrefetch ? 'prefetch' : '',
  ].join('|');
}

export function isOverlayEmptyGapActive(input: {
  notificationOverlayVisible: boolean;
  hasRenderableCard: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  checkAnswerWaitingResultHoldBanId: string | null;
}): boolean {
  if (input.notificationOverlayVisible && input.hasRenderableCard) {
    return false;
  }
  return (
    input.notificationChainTransitioning ||
    input.chainAdvanceWaiting ||
    Boolean(input.checkAnswerWaitingResultHoldBanId)
  );
}
