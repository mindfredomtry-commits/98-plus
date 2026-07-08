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

export type OverlayBackdropGapHoldTrace = {
  timestamp: number;
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
  ownerPendingLen: number;
  sendFlowOpening: boolean;
  shouldMountNotificationOverlayHost: boolean;
  globalOverlayHostActive: boolean;
  reason: string;
};

export function isActiveNotificationQueueHeadKind(
  queueHeadKind: string | null,
): boolean {
  return (
    queueHeadKind === 'incoming' ||
    queueHeadKind === 'check' ||
    queueHeadKind === 'result'
  );
}

export function shouldHoldOverlayBackdropDuringQueueGap(input: {
  visualQueueDimSessionLive: boolean;
  sendFlowOpening: boolean;
  replyParentTimerOwnsTopLayer: boolean;
  ownerQueueLen: number;
  queueHeadKind: string | null;
  notificationChainTransitioning: boolean;
  notificationSessionActive: boolean;
  chainAdvanceWaiting: boolean;
}): boolean {
  const notificationChainActive =
    isActiveNotificationQueueHeadKind(input.queueHeadKind) ||
    input.notificationChainTransitioning ||
    input.notificationSessionActive ||
    input.chainAdvanceWaiting;

  return (
    input.visualQueueDimSessionLive &&
    !input.sendFlowOpening &&
    !input.replyParentTimerOwnsTopLayer &&
    input.ownerQueueLen > 0 &&
    notificationChainActive
  );
}

export function shouldMountOverlayHostForQueueGap(input: {
  cardContentMounted: boolean;
  visualQueueDimSessionLiveWithQueueHead: boolean;
}): boolean {
  return (
    input.cardContentMounted || input.visualQueueDimSessionLiveWithQueueHead
  );
}

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
  cardContentMounted: boolean;
  visualQueueDimSessionLiveWithQueueHead: boolean;
  shieldBackdropVisible: boolean;
  shieldHostMounted: boolean;
  activeKind: string | null;
  shellKind: string | null;
}): OverlayBackdropVisibilityDecisionTrace {
  const gapBackdropHold = shouldHoldOverlayBackdropDuringQueueGap({
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    sendFlowOpening: input.sendFlowOpening,
    replyParentTimerOwnsTopLayer: input.replyParentTimerOwnsTopLayer,
    ownerQueueLen: input.ownerQueueLen,
    queueHeadKind: input.queueHeadKind,
    notificationChainTransitioning: input.notificationChainTransitioning,
    notificationSessionActive: input.notificationSessionActive,
    chainAdvanceWaiting: input.chainAdvanceWaiting,
  });

  const hostMountForGap = shouldMountOverlayHostForQueueGap({
    cardContentMounted: input.cardContentMounted,
    visualQueueDimSessionLiveWithQueueHead:
      input.visualQueueDimSessionLiveWithQueueHead,
  });

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
    reason = input.cardContentMounted
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
    (hostMountForGap || dimVisibleAfter || input.shieldHostMounted);

  return {
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    notificationOverlayVisible: input.notificationOverlayVisible,
    dimVisibleBefore: input.dimVisibleBefore,
    dimVisibleAfter,
    backdropMounted,
    cardMounted: input.cardContentMounted,
    activeKind: input.activeKind,
    shellKind: input.shellKind,
    queueHeadKind: input.queueHeadKind,
    ownerQueueLength: input.ownerQueueLen,
    sendFlowOpening: input.sendFlowOpening,
    reason,
  };
}

export function buildOverlayBackdropGapHoldTrace(input: {
  visualQueueDimSessionLive: boolean;
  notificationOverlayVisible: boolean;
  dimVisibleBefore: boolean;
  dimVisibleAfter: boolean;
  backdropMounted: boolean;
  cardContentMounted: boolean;
  activeKind: string | null;
  shellKind: string | null;
  queueHeadKind: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  sendFlowOpening: boolean;
  shouldMountNotificationOverlayHost: boolean;
  globalOverlayHostActive: boolean;
  gapBackdropHold: boolean;
}): OverlayBackdropGapHoldTrace | null {
  if (
    input.cardContentMounted ||
    !input.gapBackdropHold ||
    !input.visualQueueDimSessionLive ||
    input.sendFlowOpening ||
    input.ownerQueueLen <= 0 ||
    !isActiveNotificationQueueHeadKind(input.queueHeadKind)
  ) {
    return null;
  }

  let reason = 'visual-queue-session-holds-backdrop';
  if (!input.dimVisibleAfter) {
    reason = 'BROKEN_GAP_BACKDROP_NOT_VISIBLE';
  } else if (!input.backdropMounted) {
    reason = 'BROKEN_GAP_BACKDROP_NOT_MOUNTED';
  } else if (!input.shouldMountNotificationOverlayHost) {
    reason = 'BROKEN_GAP_HOST_SHOULD_MOUNT_FALSE';
  } else if (!input.globalOverlayHostActive) {
    reason = 'BROKEN_GAP_GLOBAL_OVERLAY_HOST_INACTIVE';
  }

  return {
    timestamp: performance.now(),
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    notificationOverlayVisible: input.notificationOverlayVisible,
    dimVisibleBefore: input.dimVisibleBefore,
    dimVisibleAfter: input.dimVisibleAfter,
    backdropMounted: input.backdropMounted,
    cardMounted: input.cardContentMounted,
    activeKind: input.activeKind,
    shellKind: input.shellKind,
    queueHeadKind: input.queueHeadKind,
    ownerQueueLength: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    sendFlowOpening: input.sendFlowOpening,
    shouldMountNotificationOverlayHost: input.shouldMountNotificationOverlayHost,
    globalOverlayHostActive: input.globalOverlayHostActive,
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

export function logOverlayBackdropGapHoldTrace(
  trace: OverlayBackdropGapHoldTrace,
): void {
  console.log('OVERLAY_BACKDROP_GAP_HOLD_TRACE', trace);
  window.__debug98log?.('OVERLAY_BACKDROP_GAP_HOLD_TRACE', trace);
}
