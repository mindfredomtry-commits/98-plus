'use client';

import type { QueueLobbyGuardSnapshot } from '@/lib/queue-lobby-guard';
import {
  buildQueueClaimsInputTrace,
  type QueueClaimsInputTrace,
} from '@/lib/queue-claims-notification-screen-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type LobbyBranchDecisionWinner =
  | 'queueClaimsNotificationScreen'
  | 'showLobby'
  | 'showLobbyOrb'
  | 'bootOrb'
  | 'fallbackIdle'
  | 'unknown';

export type LobbyBranchDecisionTrace = {
  timestamp: number;
  winner: LobbyBranchDecisionWinner;
  decisionSource: string;
  renderBranch: string;
  reason: string;

  showLobby: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  lobbyChromeHidden: boolean;

  queueClaimsNotificationScreen: boolean;
  queueLobbyGuardActive: boolean;
  guardSnapshot: QueueLobbyGuardSnapshot | null;
  claimInputs: QueueClaimsInputTrace;
  claimWinningInputs: Array<keyof QueueClaimsInputTrace>;

  overlayQueueLength: number;
  effectiveOverlayQueueLength: number;
  ownerQueueLen: number | null;
  ownerPendingLen: number | null;

  effectiveOverlayKind: string | null;
  activeOverlayKind: string | null;
  activeKind: string | null;
  shellKind: string | null;
  resolvedShellQueueHead: string | null;
  queueHeadKind: string | null;

  notificationOverlayVisible: boolean | null;
  visualQueueDimSessionLive: boolean | null;

  resultOverlayMounted: boolean;
  directOverboardMounted: boolean | null;
  incomingOverlayMounted: boolean;
  checkOverlayMounted: boolean;

  hasOverlay: boolean;
  baseLobbyHasOverlay: boolean;

  mutationSource: string | null;
  mutationReason: string | null;
};

let emittedSig = '';

export function resolveLobbyBranchDecisionWinner(input: {
  renderBranch: string;
  queueClaimsNotificationScreen: boolean;
  showLobby: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
}): LobbyBranchDecisionWinner {
  if (input.renderBranch !== 'lobby') return 'unknown';
  if (input.queueClaimsNotificationScreen) {
    return 'queueClaimsNotificationScreen';
  }
  if (input.showBootOrb) return 'bootOrb';
  if (input.showLobbyOrb) return 'showLobbyOrb';
  if (input.showLobby) return 'showLobby';
  return 'fallbackIdle';
}

function buildLobbyBranchDecisionSig(
  payload: Omit<LobbyBranchDecisionTrace, 'timestamp'>,
): string {
  return [
    payload.winner,
    payload.decisionSource,
    payload.renderBranch,
    payload.reason,
    payload.showLobby,
    payload.showLobbyOrb,
    payload.showBootOrb,
    payload.lobbyChromeHidden,
    payload.queueClaimsNotificationScreen,
    payload.queueLobbyGuardActive,
    payload.claimWinningInputs.join(','),
    payload.guardSnapshot?.queueLen,
    payload.guardSnapshot?.pendingLen,
    payload.guardSnapshot?.fromQueueResult,
    payload.guardSnapshot?.queueShellShowsResult,
    payload.guardSnapshot?.phase,
    payload.overlayQueueLength,
    payload.effectiveOverlayQueueLength,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.effectiveOverlayKind,
    payload.activeOverlayKind,
    payload.activeKind,
    payload.shellKind,
    payload.resolvedShellQueueHead,
    payload.queueHeadKind,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.resultOverlayMounted,
    payload.directOverboardMounted,
    payload.incomingOverlayMounted,
    payload.checkOverlayMounted,
    payload.hasOverlay,
    payload.baseLobbyHasOverlay,
    payload.mutationSource,
    payload.mutationReason,
  ].join('|');
}

export function traceLobbyBranchDecisionIfChanged(
  decisionSource: string,
  input: {
    renderBranch: string;
    reason: string;
    showLobby: boolean;
    showLobbyOrb: boolean;
    showBootOrb: boolean;
    lobbyChromeHidden: boolean;
    queueClaimsNotificationScreen: boolean;
    queueLobbyGuardActive: boolean;
    guardSnapshot?: QueueLobbyGuardSnapshot | null;
    overlayQueueLength: number;
    effectiveOverlayQueueLength: number;
    ownerQueueLen?: number | null;
    ownerPendingLen?: number | null;
    effectiveOverlayKind?: string | null;
    activeOverlayKind?: string | null;
    activeKind?: string | null;
    shellKind?: string | null;
    resolvedShellQueueHead?: string | null;
    queueHeadKind?: string | null;
    notificationOverlayVisible?: boolean | null;
    visualQueueDimSessionLive?: boolean | null;
    resultOverlayMounted: boolean;
    directOverboardMounted?: boolean | null;
    incomingOverlayMounted: boolean;
    checkOverlayMounted: boolean;
    hasOverlay: boolean;
    baseLobbyHasOverlay: boolean;
    mutationSource?: string | null;
    mutationReason?: string | null;
    staleResultQueueClaimActive?: boolean | null;
  },
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.renderBranch !== 'lobby') return;

  const guardSnapshot = input.guardSnapshot ?? null;
  const { claimInputs, claimWinningInputs } = buildQueueClaimsInputTrace({
    overlayQueueLength: input.overlayQueueLength,
    effectiveOverlayQueueLength: input.effectiveOverlayQueueLength,
    queueLobbyGuardActive: input.queueLobbyGuardActive,
    guardSnapshot,
    staleResultQueueClaimActive: input.staleResultQueueClaimActive,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    resultOverlayMounted: input.resultOverlayMounted,
    directOverboardMounted: input.directOverboardMounted,
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
  });

  const winner = resolveLobbyBranchDecisionWinner({
    renderBranch: input.renderBranch,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    showLobby: input.showLobby,
    showLobbyOrb: input.showLobbyOrb,
    showBootOrb: input.showBootOrb,
  });

  const body: Omit<LobbyBranchDecisionTrace, 'timestamp'> = {
    winner,
    decisionSource,
    renderBranch: input.renderBranch,
    reason: input.reason,
    showLobby: input.showLobby,
    showLobbyOrb: input.showLobbyOrb,
    showBootOrb: input.showBootOrb,
    lobbyChromeHidden: input.lobbyChromeHidden,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    queueLobbyGuardActive: input.queueLobbyGuardActive,
    guardSnapshot,
    claimInputs,
    claimWinningInputs,
    overlayQueueLength: input.overlayQueueLength,
    effectiveOverlayQueueLength: input.effectiveOverlayQueueLength,
    ownerQueueLen: input.ownerQueueLen ?? null,
    ownerPendingLen: input.ownerPendingLen ?? null,
    effectiveOverlayKind: input.effectiveOverlayKind ?? null,
    activeOverlayKind: input.activeOverlayKind ?? null,
    activeKind: input.activeKind ?? null,
    shellKind: input.shellKind ?? null,
    resolvedShellQueueHead: input.resolvedShellQueueHead ?? null,
    queueHeadKind: input.queueHeadKind ?? null,
    notificationOverlayVisible: input.notificationOverlayVisible ?? null,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive ?? null,
    resultOverlayMounted: input.resultOverlayMounted,
    directOverboardMounted: input.directOverboardMounted ?? null,
    incomingOverlayMounted: input.incomingOverlayMounted,
    checkOverlayMounted: input.checkOverlayMounted,
    hasOverlay: input.hasOverlay,
    baseLobbyHasOverlay: input.baseLobbyHasOverlay,
    mutationSource: input.mutationSource ?? null,
    mutationReason: input.mutationReason ?? null,
  };

  const sig = buildLobbyBranchDecisionSig(body);
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('LOBBY_BRANCH_DECISION_TRACE', {
    timestamp: diagTraceNow(),
    ...body,
  });
}
