'use client';

export type StickyQueueDimDecisionInput = {
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  nextPhase: string;
  sendFlowOpening: boolean;
  chainAdvanceWaiting: boolean;
  chainHandoffActive: boolean;
  replyParentTimerOwnsTopLayer: boolean;
};

export type StickyQueueDimDecision = StickyQueueDimDecisionInput & {
  stickyDimActive: boolean;
  dimVisible: boolean;
  releaseReason: string | null;
};

export function computeStickyQueueDimDecision(
  input: StickyQueueDimDecisionInput,
): StickyQueueDimDecision {
  if (input.sendFlowOpening) {
    return {
      ...input,
      stickyDimActive: false,
      dimVisible: false,
      releaseReason: 'send-flow-opening',
    };
  }
  if (input.replyParentTimerOwnsTopLayer) {
    return {
      ...input,
      stickyDimActive: false,
      dimVisible: false,
      releaseReason: 'reply-parent-timer-owns-top',
    };
  }

  const chainSticky =
    input.notificationSessionActive ||
    input.notificationChainTransitioning ||
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    input.chainAdvanceWaiting ||
    input.chainHandoffActive;

  if (!chainSticky) {
    return {
      ...input,
      stickyDimActive: false,
      dimVisible: false,
      releaseReason: 'queue-chain-inactive',
    };
  }

  return {
    ...input,
    stickyDimActive: true,
    dimVisible: true,
    releaseReason: null,
  };
}

export function logStickyQueueDimDecision(
  decision: StickyQueueDimDecision,
): void {
  const payload = { timestamp: performance.now(), ...decision };
  console.log('STICKY_QUEUE_DIM_DECISION', payload);
  window.__debug98log?.('STICKY_QUEUE_DIM_DECISION', payload);
}
