'use client';

export type EmptyHostBugQueueItemSnapshot = {
  kind: string | null;
  banId: string | null;
  resultId: string | null;
} | null;

export type EmptyHostBugTrace = {
  caller: string;
  reason: string;
  queueLen: number;
  pendingLen: number;
  shellKind: string | null;
  activeKind: string | null;
  effectiveKind: string | null;
  queueHeadKind: string | null;
  selectedBanId: string | null;
  activeBanId: string | null;
  displayKind: string | null;
  ownerActive: Record<string, unknown> | null;
  ownerDisplay: Record<string, unknown> | null;
  ownerQueueHead: EmptyHostBugQueueItemSnapshot;
  ownerPendingHead: EmptyHostBugQueueItemSnapshot;
  willRender: boolean;
  renderBranch: string | null;
  childrenBranch: string | null;
  hasContent: boolean;
  visible: boolean;
  notificationOverlayVisible: boolean;
  shouldMountNotificationOverlayHost: boolean;
  visualQueueDimSession: boolean;
  visualQueueDimSessionRef: boolean;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
};

export function serializeEmptyHostBugQueueItem(
  item: unknown,
): EmptyHostBugQueueItemSnapshot {
  if (!item || typeof item !== 'object' || !('kind' in item)) {
    return null;
  }
  const kind = String((item as { kind?: unknown }).kind ?? '') || null;
  if (kind === 'result' && 'result' in item) {
    const result = (item as { result?: { id?: string } }).result;
    const resultId = result?.id?.trim() || null;
    return { kind, banId: resultId, resultId };
  }
  if ('ban' in item) {
    const banId =
      (item as { ban?: { id?: string } }).ban?.id?.trim() || null;
    return { kind, banId, resultId: null };
  }
  return { kind, banId: null, resultId: null };
}

export function logEmptyHostBugTrace(trace: EmptyHostBugTrace): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('EMPTY_HOST_BUG_TRACE', payload);
  window.__debug98log?.('EMPTY_HOST_BUG_TRACE', payload);
}
