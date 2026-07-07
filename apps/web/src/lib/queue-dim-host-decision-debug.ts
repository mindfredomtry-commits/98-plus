'use client';

export type QueueDimHostDecisionTrace = {
  visualQueueDimSession: boolean;
  visualQueueDimSessionRef: boolean;
  shouldMountNotificationOverlayHost: boolean;
  notificationHostSessionBackdrop: boolean;
  dimVisible: boolean;
  backdropVisible: boolean;
  hostMounted: boolean;
  notificationOverlayVisible: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  kind: string | null;
  effectiveKind: string | null;
  hasContent: boolean;
  visible: boolean;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  sendFlowOpening: boolean;
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  replyParentTimerOwnsTopLayer: boolean;
  releaseReason: string | null;
  decisionReason: string;
};

export function computeQueueDimHostDecision(input: {
  visualQueueDimSession: boolean;
  visualQueueDimSessionRef: boolean;
  shouldMountNotificationOverlayHost: boolean;
  notificationHostSessionBackdrop: boolean;
  notificationOverlayVisible: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  kind: string | null;
  effectiveKind: string | null;
  hasContent: boolean;
  visible: boolean;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  sendFlowOpening: boolean;
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  replyParentTimerOwnsTopLayer: boolean;
  releaseReason?: string | null;
}): QueueDimHostDecisionTrace {
  const sessionLive =
    input.visualQueueDimSessionRef || input.visualQueueDimSession;
  const hostBranchOpen =
    !input.showDirectOverboardLayer || sessionLive;
  const hostMounted =
    hostBranchOpen &&
    !input.composeBlocksNotificationHost &&
    (input.shouldMountNotificationOverlayHost || sessionLive);
  const backdropVisible =
    hostMounted && input.notificationHostSessionBackdrop;
  const dimVisible = backdropVisible;

  let decisionReason = 'ok';
  if (sessionLive && !dimVisible) {
    decisionReason = 'BROKEN_STICKY_DIM_CONTRACT';
    if (!hostBranchOpen) {
      decisionReason += ':show-direct-overboard-suppresses-host-branch';
    } else if (input.composeBlocksNotificationHost) {
      decisionReason += ':compose-blocks-host';
    } else if (!input.shouldMountNotificationOverlayHost && !sessionLive) {
      decisionReason += ':should-mount-false';
    } else if (!input.notificationHostSessionBackdrop) {
      if (input.replyParentTimerOwnsTopLayer) {
        decisionReason += ':reply-parent-timer-owns-top';
      } else if (input.sendFlowOpening) {
        decisionReason += ':send-flow-opening';
      } else if (!input.visualQueueDimSession) {
        decisionReason += ':session-state-false';
      } else {
        decisionReason += ':notification-host-session-backdrop-false';
      }
    } else if (!hostMounted) {
      decisionReason += ':host-not-mounted';
    }
  } else if (!sessionLive && dimVisible) {
    decisionReason = 'dim-visible-without-visual-session';
  } else if (!hostMounted && input.notificationOverlayVisible) {
    decisionReason = 'overlay-visible-host-not-mounted';
  } else if (hostMounted && !backdropVisible && sessionLive) {
    decisionReason = 'BROKEN_STICKY_DIM_CONTRACT:host-mounted-backdrop-false';
  }

  return {
    visualQueueDimSession: input.visualQueueDimSession,
    visualQueueDimSessionRef: input.visualQueueDimSessionRef,
    shouldMountNotificationOverlayHost: input.shouldMountNotificationOverlayHost,
    notificationHostSessionBackdrop: input.notificationHostSessionBackdrop,
    dimVisible,
    backdropVisible,
    hostMounted,
    notificationOverlayVisible: input.notificationOverlayVisible,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    activeKind: input.activeKind,
    displayKind: input.displayKind,
    kind: input.kind,
    effectiveKind: input.effectiveKind,
    hasContent: input.hasContent,
    visible: input.visible,
    notificationSessionActive: input.notificationSessionActive,
    notificationChainTransitioning: input.notificationChainTransitioning,
    sendFlowOpening: input.sendFlowOpening,
    composeBlocksNotificationHost: input.composeBlocksNotificationHost,
    showDirectOverboardLayer: input.showDirectOverboardLayer,
    replyParentTimerOwnsTopLayer: input.replyParentTimerOwnsTopLayer,
    releaseReason: input.releaseReason ?? null,
    decisionReason,
  };
}

export function logQueueDimHostDecisionTrace(
  trace: QueueDimHostDecisionTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('QUEUE_DIM_HOST_DECISION_TRACE', payload);
  window.__debug98log?.('QUEUE_DIM_HOST_DECISION_TRACE', payload);
}
