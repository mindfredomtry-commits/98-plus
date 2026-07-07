'use client';

export type LobbyBranchDuringQueueTrace = {
  renderBranch: string;
  reason: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  activeKind: string | null;
  effectiveKind: string | null;
  shellKind: string | null;
  displayKind: string | null;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  visualQueueDimSession: boolean;
  visualQueueDimSessionRef: boolean;
  visualQueueDimSessionLive: boolean;
  notificationOverlayVisible: boolean;
  shouldMountNotificationOverlayHost: boolean;
  showLobby: boolean;
  showLobbyOrb: boolean;
  lobbyOpen: boolean;
  composeState: string | null;
  phase: string | null;
  sendFlowOpening: boolean;
  previousKind: string | null;
  previousAction: string | null;
  nextQueueLen: number;
  nextPendingLen: number;
  caller: string;
  source: string;
  decisionReason: string;
};

export function shouldHoldLobbyShellDuringActiveQueue(input: {
  sendFlowOpening: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  notificationChainTransitioning: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
}): boolean {
  if (input.sendFlowOpening) return false;
  const queueHeadKindActive =
    input.queueHeadKind === 'incoming' ||
    input.queueHeadKind === 'check' ||
    input.queueHeadKind === 'result';
  const visualQueueGap =
    input.visualQueueDimSessionLive &&
    input.ownerQueueLen > 0 &&
    queueHeadKindActive;
  return (
    input.notificationOverlayVisible ||
    input.notificationChainTransitioning ||
    visualQueueGap ||
    input.ownerPendingLen > 0
  );
}

export function resolveLobbyBranchDuringQueueDecisionReason(input: {
  renderBranch: string;
  visualQueueDimSessionRef: boolean;
  notificationChainTransitioning: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
}): string {
  if (input.renderBranch !== 'lobby') {
    return 'not-lobby-branch';
  }
  if (
    input.visualQueueDimSessionRef ||
    input.notificationChainTransitioning ||
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0
  ) {
    return 'LOBBY_BRANCH_DURING_ACTIVE_QUEUE';
  }
  return 'lobby-branch-ok';
}

export function shouldLogLobbyBranchDuringQueueTrace(input: {
  renderBranch: string;
  visualQueueDimSessionRef: boolean;
  visualQueueDimSessionLive: boolean;
  notificationChainTransitioning: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  notificationOverlayVisible: boolean;
}): boolean {
  if (input.renderBranch !== 'lobby') return false;
  return (
    input.visualQueueDimSessionRef ||
    input.visualQueueDimSessionLive ||
    input.notificationChainTransitioning ||
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    input.notificationOverlayVisible
  );
}

export function logLobbyBranchDuringQueueTrace(
  trace: LobbyBranchDuringQueueTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('LOBBY_BRANCH_DURING_QUEUE_TRACE', payload);
  window.__debug98log?.('LOBBY_BRANCH_DURING_QUEUE_TRACE', payload);
}
