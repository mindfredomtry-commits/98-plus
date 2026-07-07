'use client';

export type OverlayBackdropVisibilityDecisionTrace = {
  visualQueueDimSessionLive: boolean;
  notificationOverlayVisible: boolean;
  dimVisibleBefore: boolean;
  dimVisibleAfter: boolean;
  backdropMounted: boolean;
  cardMounted: boolean;
  activeKind: string | null;
  shellKind: string | null;
  queueHeadKind: string | null;
  ownerQueueLength: number;
  sendFlowOpening: boolean;
  reason: string;
};

export function computeOverlayBackdropVisibilityDecision(input: {
  visualQueueDimSessionLive: boolean;
  notificationOverlayVisible: boolean;
  dimVisibleBefore: boolean;
  sendFlowOpening: boolean;
  replyParentTimerOwnsTopLayer: boolean;
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  ownerQueueLen: number;
  queueHeadKind: string | null;
  notificationChainTransitioning: boolean;
  notificationSessionActive: boolean;
  chainAdvanceWaiting: boolean;
  cardMounted: boolean;
  shieldBackdropVisible: boolean;
  shieldHostMounted: boolean;
  activeKind: string | null;
  shellKind: string | null;
}): OverlayBackdropVisibilityDecisionTrace {
  const queueHeadKindActive =
    input.queueHeadKind === 'incoming' ||
    input.queueHeadKind === 'check' ||
    input.queueHeadKind === 'result';
  const notificationChainActive =
    queueHeadKindActive ||
    input.notificationChainTransitioning ||
    input.notificationSessionActive ||
    input.chainAdvanceWaiting;

  const gapBackdropHold =
    input.visualQueueDimSessionLive &&
    !input.sendFlowOpening &&
    !input.replyParentTimerOwnsTopLayer &&
    input.ownerQueueLen > 0 &&
    notificationChainActive;

  let dimVisibleAfter = false;
  let reason = 'released';

  if (input.sendFlowOpening || input.composeBlocksNotificationHost) {
    dimVisibleAfter = false;
    reason = input.sendFlowOpening ? 'send-flow-opening' : 'compose-blocks-host';
  } else if (input.replyParentTimerOwnsTopLayer) {
    dimVisibleAfter = false;
    reason = 'reply-parent-timer-owns-top';
  } else if (gapBackdropHold) {
    dimVisibleAfter = true;
    reason = input.cardMounted
      ? 'card-with-backdrop-visible'
      : 'visual-queue-session-holds-backdrop';
  } else if (input.shieldBackdropVisible) {
    dimVisibleAfter = true;
    reason = 'shield-backdrop-visible';
  } else if (input.notificationOverlayVisible) {
    dimVisibleAfter = true;
    reason = 'notification-overlay-visible';
  }

  const hostBranchOpen =
    !input.showDirectOverboardLayer ||
    gapBackdropHold ||
    input.shieldBackdropVisible;
  const backdropMounted =
    hostBranchOpen &&
    !input.composeBlocksNotificationHost &&
    (dimVisibleAfter || input.shieldHostMounted);

  return {
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    notificationOverlayVisible: input.notificationOverlayVisible,
    dimVisibleBefore: input.dimVisibleBefore,
    dimVisibleAfter,
    backdropMounted,
    cardMounted: input.cardMounted,
    activeKind: input.activeKind,
    shellKind: input.shellKind,
    queueHeadKind: input.queueHeadKind,
    ownerQueueLength: input.ownerQueueLen,
    sendFlowOpening: input.sendFlowOpening,
    reason,
  };
}

export function logOverlayBackdropVisibilityDecision(
  trace: OverlayBackdropVisibilityDecisionTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('OVERLAY_BACKDROP_VISIBILITY_DECISION', payload);
  window.__debug98log?.('OVERLAY_BACKDROP_VISIBILITY_DECISION', payload);
}
