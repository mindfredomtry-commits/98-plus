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

  // Vertical 2: visualQueueDim is paint-only — cannot mount host alone.
  // Mount authority = runtime selectOverlayVisible (via shouldMount + notificationOverlayVisible).
  const cardContentMounted =
    input.shouldMountNotificationOverlayHostFromGuards &&
    input.notificationOverlayVisible &&
    !input.showDirectOverboardLayer &&
    !input.composeBlocksNotificationHost;

  const hostMounted = cardContentMounted;

  const backdropVisible =
    hostMounted && (shieldHolds || input.notificationOverlayVisible);

  let renderBranch = 'no-overlay';
  if (input.composeBlocksNotificationHost) {
    renderBranch = 'compose-blocks';
  } else if (input.showDirectOverboardLayer) {
    renderBranch = 'direct-overboard';
  } else if (hostMounted) {
    renderBranch = input.shellDisplayKind
      ? `shell-${input.shellDisplayKind}`
      : 'shell-null';
  } else if (shieldHolds) {
    renderBranch = 'v2-dim-paint-only-no-mount';
  }

  let decisionReason = 'ok';
  if (cardContentMounted) {
    decisionReason = 'v2-runtime-overlay-visible';
  } else if (shieldHolds && !hostMounted) {
    decisionReason = 'v2-dim-paint-only-no-mount';
  } else if (!shieldHolds && !hostMounted) {
    decisionReason = 'shield-released';
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
