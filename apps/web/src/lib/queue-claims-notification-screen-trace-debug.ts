'use client';

import type { QueueLobbyGuardSnapshot } from '@/lib/queue-lobby-guard';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueClaimsInputTrace = {
  overlayQueueLengthGt0: boolean;
  effectiveOverlayQueueLengthGt0: boolean;
  queueLobbyGuardActive: boolean;
  guardFromQueueResult: boolean;
  guardQueueShellShowsResult: boolean;
  guardPhaseNotIdle: boolean;
  staleResultQueueClaimActive: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  resultOverlayMounted: boolean;
  directOverboardMounted: boolean;
  ownerQueueLenGt0: boolean;
  ownerPendingLenGt0: boolean;
};

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
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;
};

export type QueueClaimsStaleLobbyBranchDetectedTrace = {
  timestamp: number;
  reason: string;
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;
  guardSnapshot: QueueLobbyGuardSnapshot | null;
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
  source: string;
};

type QueueClaimsSnapshotProvider = () => Partial<
  Omit<QueueClaimsNotificationScreenTrace, 'timestamp' | 'source' | 'reason'>
>;

let snapshotProvider: QueueClaimsSnapshotProvider | null = null;
const emittedSigBySource = new Map<string, string>();
let emittedStaleLobbyBranchSig = '';

function buildStaleLobbyBranchDetectedSig(
  payload: QueueClaimsStaleLobbyBranchDetectedTrace,
): string {
  return [
    payload.reason,
    payload.claimWinningInputs.join(','),
    payload.guardSnapshot?.queueLen,
    payload.guardSnapshot?.pendingLen,
    payload.guardSnapshot?.fromQueueResult,
    payload.guardSnapshot?.queueShellShowsResult,
    payload.guardSnapshot?.phase,
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
  ].join('|');
}

function emitQueueClaimsStaleLobbyBranchDetectedIfNeeded(
  payload: QueueClaimsNotificationScreenTrace,
): void {
  if (payload.renderBranch !== 'lobby') return;
  if (!payload.queueClaimsNotificationScreen) return;
  if (payload.overlayQueueLength !== 0) return;

  const stalePayload: QueueClaimsStaleLobbyBranchDetectedTrace = {
    timestamp: payload.timestamp,
    reason: payload.reason,
    claimInputs: payload.claimInputs,
    claimWinningInputs: payload.claimWinningInputs,
    guardSnapshot: payload.guardSnapshot ?? null,
    ownerQueueLen: payload.ownerQueueLen,
    ownerPendingLen: payload.ownerPendingLen,
    activeOverlayKind: payload.activeOverlayKind,
    shellKind: payload.shellKind,
    activeKind: payload.activeKind,
    notificationOverlayVisible: payload.notificationOverlayVisible,
    visualQueueDimSessionLive: payload.visualQueueDimSessionLive,
    resultOverlayMounted: payload.resultOverlayMounted,
    directOverboardMounted: payload.directOverboardMounted,
    showLobbyOrb: payload.showLobbyOrb,
    lobbyChromeHidden: payload.lobbyChromeHidden,
    source: payload.source,
  };

  const staleSig = buildStaleLobbyBranchDetectedSig(stalePayload);
  if (emittedStaleLobbyBranchSig === staleSig) return;
  emittedStaleLobbyBranchSig = staleSig;

  emitClientDiagTrace(
    'QUEUE_CLAIMS_STALE_LOBBY_BRANCH_DETECTED',
    stalePayload,
  );
}

export function registerQueueClaimsNotificationScreenSnapshotProvider(
  provider: QueueClaimsSnapshotProvider | null,
): void {
  snapshotProvider = provider;
}

export function buildQueueClaimsInputTrace(input: {
  overlayQueueLength: number;
  effectiveOverlayQueueLength?: number | null;
  queueLobbyGuardActive?: boolean | null;
  guardSnapshot?: QueueLobbyGuardSnapshot | null;
  staleResultQueueClaimActive?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  resultOverlayMounted?: boolean | null;
  directOverboardMounted?: boolean | null;
  ownerQueueLen?: number | null;
  ownerPendingLen?: number | null;
}): {
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;
} {
  const guard = input.guardSnapshot;
  const effectiveOverlayQueueLength =
    input.effectiveOverlayQueueLength ?? input.overlayQueueLength;
  const claimInputs: QueueClaimsInputTrace = {
    overlayQueueLengthGt0: input.overlayQueueLength > 0,
    effectiveOverlayQueueLengthGt0: effectiveOverlayQueueLength > 0,
    queueLobbyGuardActive: input.queueLobbyGuardActive === true,
    guardFromQueueResult: guard?.fromQueueResult === true,
    guardQueueShellShowsResult: guard?.queueShellShowsResult === true,
    guardPhaseNotIdle: Boolean(guard?.phase && guard.phase !== 'idle'),
    staleResultQueueClaimActive: input.staleResultQueueClaimActive === true,
    notificationOverlayVisible: input.notificationOverlayVisible === true,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive === true,
    resultOverlayMounted: input.resultOverlayMounted === true,
    directOverboardMounted: input.directOverboardMounted === true,
    ownerQueueLenGt0: (input.ownerQueueLen ?? 0) > 0,
    ownerPendingLenGt0: (input.ownerPendingLen ?? 0) > 0,
  };
  const claimWinningInputs = (
    Object.keys(claimInputs) as Array<keyof QueueClaimsInputTrace>
  ).filter((key) => claimInputs[key]);

  return { claimInputs, claimWinningInputs };
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
  if (!isClientDiagTraceEnvironment()) return;

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

  const ownerQueueLen = input.ownerQueueLen ?? provider.ownerQueueLen ?? null;
  const ownerPendingLen = input.ownerPendingLen ?? provider.ownerPendingLen ?? null;
  const notificationOverlayVisible =
    input.notificationOverlayVisible ?? provider.notificationOverlayVisible ?? null;
  const visualQueueDimSessionLive =
    input.visualQueueDimSessionLive ?? provider.visualQueueDimSessionLive ?? null;
  const resultOverlayMounted =
    input.resultOverlayMounted ?? provider.resultOverlayMounted ?? null;
  const directOverboardMounted =
    input.directOverboardMounted ?? provider.directOverboardMounted ?? null;
  const effectiveOverlayQueueLength =
    input.effectiveOverlayQueueLength ??
    provider.effectiveOverlayQueueLength ??
    null;
  const staleResultQueueClaimActive =
    input.staleResultQueueClaimActive ??
    provider.staleResultQueueClaimActive ??
    null;
  const { claimInputs, claimWinningInputs } = buildQueueClaimsInputTrace({
    overlayQueueLength,
    effectiveOverlayQueueLength,
    queueLobbyGuardActive,
    guardSnapshot,
    staleResultQueueClaimActive,
    notificationOverlayVisible,
    visualQueueDimSessionLive,
    resultOverlayMounted,
    directOverboardMounted,
    ownerQueueLen,
    ownerPendingLen,
  });

  const payload: QueueClaimsNotificationScreenTrace = {
    timestamp: diagTraceNow(),
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    overlayQueueLength,
    ownerQueueLen,
    ownerPendingLen,
    activeOverlayKind:
      input.activeOverlayKind ?? provider.activeOverlayKind ?? null,
    shellKind: input.shellKind ?? provider.shellKind ?? null,
    activeKind: input.activeKind ?? provider.activeKind ?? null,
    notificationOverlayVisible,
    visualQueueDimSessionLive,
    resultOverlayMounted,
    directOverboardMounted,
    showLobbyOrb: input.showLobbyOrb ?? provider.showLobbyOrb ?? null,
    lobbyChromeHidden:
      input.lobbyChromeHidden ?? provider.lobbyChromeHidden ?? null,
    renderBranch,
    reason,
    source,
    queueLobbyGuardActive,
    guardSnapshot,
    effectiveOverlayQueueLength,
    staleResultQueueClaimActive,
    claimInputs,
    claimWinningInputs,
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
    payload.claimWinningInputs.join(','),
  ].join('|');

  const sourceSig = `${source}|${sig}`;
  emitQueueClaimsStaleLobbyBranchDetectedIfNeeded(payload);
  if (emittedSigBySource.get(source) === sourceSig) return;
  emittedSigBySource.set(source, sourceSig);

  emitClientDiagTrace('QUEUE_CLAIMS_NOTIFICATION_SCREEN_TRACE', payload);
}
