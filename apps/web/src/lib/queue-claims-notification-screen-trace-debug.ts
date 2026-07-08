'use client';

import type { QueueLobbyGuardSnapshot } from '@/lib/queue-lobby-guard';

export type QueueClaimsNotificationScreenTrace = {
  timestamp: number;
  queueClaimsNotificationScreen: boolean;
  overlayQueueLength: number;
  ownerQueueLen: number | null;
  ownerPendingLen: number | null;
  activeOverlayKind: string | null;
  shellKind: string | null;
  activeKind: string | null;
  notificationOverlayVisible: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  resultOverlayMounted: boolean | null;
  directOverboardMounted: boolean | null;
  showLobbyOrb: boolean | null;
  lobbyChromeHidden: boolean | null;
  renderBranch: string | null;
  reason: string;
  source: string;
  queueLobbyGuardActive?: boolean | null;
  guardSnapshot?: QueueLobbyGuardSnapshot | null;
  effectiveOverlayQueueLength?: number | null;
  staleResultQueueClaimActive?: boolean | null;
};

type QueueClaimsSnapshotProvider = () => Partial<
  Omit<QueueClaimsNotificationScreenTrace, 'timestamp' | 'source' | 'reason'>
>;

let snapshotProvider: QueueClaimsSnapshotProvider | null = null;
const emittedSigBySource = new Map<string, string>();

export function registerQueueClaimsNotificationScreenSnapshotProvider(
  provider: QueueClaimsSnapshotProvider | null,
): void {
  snapshotProvider = provider;
}

export function resolveQueueClaimsNotificationScreenReason(input: {
  queueClaimsNotificationScreen: boolean;
  overlayQueueLength: number;
  queueLobbyGuardActive?: boolean;
  guardSnapshot?: QueueLobbyGuardSnapshot | null;
  renderBranch?: string | null;
}): string {
  if (!input.queueClaimsNotificationScreen) {
    return 'claim-released';
  }

  if (input.overlayQueueLength > 0) {
    return 'overlay-queue-length-gt-0';
  }

  const guard = input.guardSnapshot;
  if (input.queueLobbyGuardActive) {
    if (guard?.fromQueueResult) {
      return 'guard-from-queue-result';
    }
    if (guard?.queueShellShowsResult) {
      return 'guard-queue-shell-shows-result';
    }
    if (guard?.phase === 'queueShellShowsResult') {
      return 'guard-phase-queue-shell-shows-result';
    }
    if ((guard?.queueLen ?? 0) > 0) {
      return 'guard-stale-queue-len-with-empty-overlay';
    }
    if (guard?.phase && guard.phase !== 'idle') {
      return `guard-phase-${guard.phase}`;
    }
    return 'queue-lobby-guard-active';
  }

  if (
    input.renderBranch === 'lobby' &&
    input.overlayQueueLength === 0
  ) {
    return 'stale-claim-empty-overlay-queue-lobby-visible';
  }

  return 'claim-active-unknown';
}

export function traceQueueClaimsNotificationScreenIfChanged(
  source: string,
  input: Partial<QueueClaimsNotificationScreenTrace> & {
    queueClaimsNotificationScreen: boolean;
    overlayQueueLength: number;
    renderBranch?: string | null;
    queueLobbyGuardActive?: boolean;
    guardSnapshot?: QueueLobbyGuardSnapshot | null;
  },
): void {
  const provider = snapshotProvider?.() ?? {};
  const guardSnapshot =
    input.guardSnapshot ?? provider.guardSnapshot ?? null;
  const queueLobbyGuardActive =
    input.queueLobbyGuardActive ?? provider.queueLobbyGuardActive ?? null;
  const overlayQueueLength = input.overlayQueueLength;
  const renderBranch = input.renderBranch ?? provider.renderBranch ?? null;

  const reason =
    input.reason ??
    resolveQueueClaimsNotificationScreenReason({
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
      overlayQueueLength,
      queueLobbyGuardActive: queueLobbyGuardActive === true,
      guardSnapshot,
      renderBranch,
    });

  const payload: QueueClaimsNotificationScreenTrace = {
    timestamp: performance.now(),
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    overlayQueueLength,
    ownerQueueLen: input.ownerQueueLen ?? provider.ownerQueueLen ?? null,
    ownerPendingLen: input.ownerPendingLen ?? provider.ownerPendingLen ?? null,
    activeOverlayKind:
      input.activeOverlayKind ?? provider.activeOverlayKind ?? null,
    shellKind: input.shellKind ?? provider.shellKind ?? null,
    activeKind: input.activeKind ?? provider.activeKind ?? null,
    notificationOverlayVisible:
      input.notificationOverlayVisible ?? provider.notificationOverlayVisible ?? null,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ?? provider.visualQueueDimSessionLive ?? null,
    resultOverlayMounted:
      input.resultOverlayMounted ?? provider.resultOverlayMounted ?? null,
    directOverboardMounted:
      input.directOverboardMounted ?? provider.directOverboardMounted ?? null,
    showLobbyOrb: input.showLobbyOrb ?? provider.showLobbyOrb ?? null,
    lobbyChromeHidden:
      input.lobbyChromeHidden ?? provider.lobbyChromeHidden ?? null,
    renderBranch,
    reason,
    source,
    queueLobbyGuardActive,
    guardSnapshot,
    effectiveOverlayQueueLength:
      input.effectiveOverlayQueueLength ??
      provider.effectiveOverlayQueueLength ??
      null,
    staleResultQueueClaimActive:
      input.staleResultQueueClaimActive ??
      provider.staleResultQueueClaimActive ??
      null,
  };

  const sig = [
    payload.queueClaimsNotificationScreen,
    payload.overlayQueueLength,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.activeOverlayKind,
    payload.shellKind,
    payload.activeKind,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.resultOverlayMounted,
    payload.directOverboardMounted,
    payload.showLobbyOrb,
    payload.lobbyChromeHidden,
    payload.renderBranch,
    payload.reason,
    payload.queueLobbyGuardActive,
    payload.guardSnapshot?.queueLen,
    payload.guardSnapshot?.pendingLen,
    payload.guardSnapshot?.fromQueueResult,
    payload.guardSnapshot?.queueShellShowsResult,
    payload.guardSnapshot?.phase,
  ].join('|');

  const sourceSig = `${source}|${sig}`;
  if (emittedSigBySource.get(source) === sourceSig) return;
  emittedSigBySource.set(source, sourceSig);

  console.log('QUEUE_CLAIMS_NOTIFICATION_SCREEN_TRACE', payload);
  window.__debug98log?.('QUEUE_CLAIMS_NOTIFICATION_SCREEN_TRACE', payload);
}
