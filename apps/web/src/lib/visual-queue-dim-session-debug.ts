'use client';

export type VisualQueueDimSessionKind = 'incoming' | 'check' | 'result';

export type VisualQueueMountedCardSnapshot = {
  mountedCardVisible: boolean;
  mountedCardHasContent: boolean;
  kind: VisualQueueDimSessionKind | null;
  effectiveKind: VisualQueueDimSessionKind | null;
};

export type VisualQueueDimSessionTrace = {
  event: 'start' | 'keep' | 'release' | 'skip';
  reason: string;
  visualQueueDimSession: boolean;
  mountedCardVisible: boolean;
  mountedCardHasContent: boolean;
  kind: VisualQueueDimSessionKind | null;
  effectiveKind: VisualQueueDimSessionKind | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  sendFlowOpening: boolean;
  dimVisible: boolean;
};

export function resolveVisualQueueMountedCard(input: {
  composeBlocksNotificationHost: boolean;
  showCheckOverlayDirect: boolean;
  showReplyIncomingOverlayDirect: boolean;
  kind: VisualQueueDimSessionKind | null;
  effectiveKind: VisualQueueDimSessionKind | null;
  incomingVisible: boolean;
  checkVisible: boolean;
  resultVisible: boolean;
  incomingCardReady: boolean;
  checkCardReady: boolean;
  resultContentReady: boolean;
}): VisualQueueMountedCardSnapshot {
  if (
    input.composeBlocksNotificationHost ||
    input.showCheckOverlayDirect ||
    input.showReplyIncomingOverlayDirect
  ) {
    return {
      mountedCardVisible: false,
      mountedCardHasContent: false,
      kind: null,
      effectiveKind: input.effectiveKind,
    };
  }

  const resolvedKind = input.kind ?? input.effectiveKind;
  if (
    resolvedKind !== 'incoming' &&
    resolvedKind !== 'check' &&
    resolvedKind !== 'result'
  ) {
    return {
      mountedCardVisible: false,
      mountedCardHasContent: false,
      kind: input.kind,
      effectiveKind: input.effectiveKind,
    };
  }

  const mountedCardVisible =
    resolvedKind === 'incoming'
      ? input.incomingVisible
      : resolvedKind === 'check'
        ? input.checkVisible
        : input.resultVisible;
  const mountedCardHasContent =
    resolvedKind === 'incoming'
      ? input.incomingCardReady
      : resolvedKind === 'check'
        ? input.checkCardReady
        : input.resultContentReady;

  return {
    mountedCardVisible,
    mountedCardHasContent,
    kind: input.kind,
    effectiveKind: input.effectiveKind,
  };
}

export function shouldReleaseVisualQueueDimSession(input: {
  sendFlowOpening: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  mountedCardVisible: boolean;
  mountedCardHasContent: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  chainHandoffActive: boolean;
}): { release: boolean; reason: string } {
  if (input.sendFlowOpening) {
    return { release: true, reason: 'send-flow-opening' };
  }

  const queueEmpty = input.ownerQueueLen === 0 && input.ownerPendingLen === 0;
  const noMountedCard = !input.mountedCardVisible || !input.mountedCardHasContent;
  const transitionActive =
    input.notificationChainTransitioning ||
    input.chainAdvanceWaiting ||
    input.chainHandoffActive;

  if (queueEmpty && noMountedCard && !transitionActive) {
    return { release: true, reason: 'visual-queue-session-ended' };
  }

  return { release: false, reason: '' };
}

export function logVisualQueueDimSessionTrace(
  trace: VisualQueueDimSessionTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('VISUAL_QUEUE_DIM_SESSION_TRACE', payload);
  window.__debug98log?.('VISUAL_QUEUE_DIM_SESSION_TRACE', payload);
}
