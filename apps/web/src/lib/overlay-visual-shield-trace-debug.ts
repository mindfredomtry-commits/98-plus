'use client';

export type OverlayVisualShieldTrace = {
  visualQueueDimSessionLive: boolean;
  hostMounted: boolean;
  backdropVisible: boolean;
  cardContentMounted: boolean;
  renderBranch: string;
  notificationOverlayVisible: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  sendFlowOpening: boolean;
  decisionReason: string;
};

export function shouldHoldOverlayVisualShield(input: {
  visualQueueDimSessionLive: boolean;
  sendFlowOpening: boolean;
  replyParentTimerOwnsTopLayer: boolean;
}): boolean {
  return (
    input.visualQueueDimSessionLive &&
    !input.sendFlowOpening &&
    !input.replyParentTimerOwnsTopLayer
  );
}

export function computeOverlayVisualShieldDecision(input: {
  visualQueueDimSessionLive: boolean;
  sendFlowOpening: boolean;
  replyParentTimerOwnsTopLayer: boolean;
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  notificationOverlayVisible: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  shellDisplayKind: string | null;
}): OverlayVisualShieldTrace {
  const shieldHolds = shouldHoldOverlayVisualShield({
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    sendFlowOpening: input.sendFlowOpening,
    replyParentTimerOwnsTopLayer: input.replyParentTimerOwnsTopLayer,
  });

  const cardContentMounted =
    input.shouldMountNotificationOverlayHostFromGuards &&
    !input.showDirectOverboardLayer;

  const hostBranchOpen = !input.showDirectOverboardLayer || shieldHolds;
  const hostMounted =
    hostBranchOpen &&
    !input.composeBlocksNotificationHost &&
    (cardContentMounted || shieldHolds);

  const backdropVisible = hostMounted && shieldHolds;

  let renderBranch = 'no-overlay';
  if (hostMounted) {
    renderBranch = cardContentMounted
      ? input.shellDisplayKind
        ? `shell-${input.shellDisplayKind}`
        : 'shell-null'
      : 'visual-shield-backdrop-only';
  }

  let decisionReason = 'ok';
  if (shieldHolds && hostMounted && backdropVisible && !cardContentMounted) {
    decisionReason = 'visual-shield-holds-during-card-gap';
  } else if (!shieldHolds && !hostMounted) {
    decisionReason = 'shield-released';
  } else if (shieldHolds && !backdropVisible) {
    decisionReason = 'BROKEN_VISUAL_SHIELD_CONTRACT';
    if (!hostBranchOpen) {
      decisionReason += ':show-direct-overboard-suppresses-host-branch';
    } else if (input.composeBlocksNotificationHost) {
      decisionReason += ':compose-blocks-host';
    } else if (!hostMounted) {
      decisionReason += ':host-not-mounted';
    }
  } else if (!shieldHolds && backdropVisible) {
    decisionReason = 'backdrop-visible-without-shield';
  } else if (cardContentMounted) {
    decisionReason = 'card-content-mounted';
  }

  return {
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    hostMounted,
    backdropVisible,
    cardContentMounted,
    renderBranch,
    notificationOverlayVisible: input.notificationOverlayVisible,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    queueHeadKind: input.queueHeadKind,
    sendFlowOpening: input.sendFlowOpening,
    decisionReason,
  };
}

export function logOverlayVisualShieldTrace(trace: OverlayVisualShieldTrace): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('OVERLAY_VISUAL_SHIELD_TRACE', payload);
  window.__debug98log?.('OVERLAY_VISUAL_SHIELD_TRACE', payload);
}
