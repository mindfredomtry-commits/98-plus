'use client';

export type NotificationOverlayVisibleGuardTrace = {
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  shellKind: string | null;
  hasRenderableCard: boolean;
  notificationChainTransitioning: boolean;
  sendFlowOpening: boolean;
  decisionReason: string;
};

export function shouldHoldNotificationOverlayVisibleDuringQueueGap(input: {
  visualQueueDimSessionLive: boolean;
  ownerQueueLen: number;
  queueHeadKind: string | null;
  sendFlowOpening: boolean;
}): boolean {
  const queueHeadKindActive =
    input.queueHeadKind === 'incoming' ||
    input.queueHeadKind === 'check' ||
    input.queueHeadKind === 'result';
  return (
    input.visualQueueDimSessionLive &&
    input.ownerQueueLen > 0 &&
    queueHeadKindActive &&
    !input.sendFlowOpening
  );
}

export function logNotificationOverlayVisibleGuardTrace(
  trace: NotificationOverlayVisibleGuardTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('NOTIFICATION_OVERLAY_VISIBLE_GUARD_TRACE', payload);
  window.__debug98log?.('NOTIFICATION_OVERLAY_VISIBLE_GUARD_TRACE', payload);
}
