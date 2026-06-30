'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type LobbyBansClickDecisionKind =
  | 'start-chain'
  | 'open-section'
  | 'ignored';

export type LobbyBansDiagFields = {
  indicatorVisible: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  runtimeQueueLen: number;
  runtimePendingLen: number;
  incomingCount: number;
  checkCount: number;
  resultCount: number;
  backendPendingCount: number;
  persistedAttentionHint: number;
  lobbyBansAttentionHint: number;
  hasPendingNotificationChain: boolean;
  notificationQueueUiLock: boolean;
  activeKind: string | null;
  displayKind: string | null;
  startupInteractionsHold: boolean;
  startupInteractionsLen: number;
  indicatorReason: string;
};

export function logLobbyBansIndicatorSource(
  data: LobbyBansDiagFields & Record<string, unknown>,
): void {
  emit('LOBBY_BANS_INDICATOR_SOURCE', data);
}

export function logLobbyBansClickDecisionDiag(
  data: LobbyBansDiagFields & {
    source: string;
    decision: LobbyBansClickDecisionKind;
    reason: string;
  } & Record<string, unknown>,
): void {
  emit('LOBBY_BANS_CLICK_DECISION', data);
}

export function logChainStartRejectedFromLobbyClick(
  data: LobbyBansDiagFields & {
    source: string;
    decision: 'open-section';
    rejectionReason: string;
    missingSource: string | null;
    blockedGuard: string;
    drainGateSource?: string;
    indicatorTrueButQueueEmpty?: boolean;
    whyOpenSectionDespiteIndicator?: string;
  } & Record<string, unknown>,
): void {
  emit('CHAIN_START_REJECTED_FROM_LOBBY_CLICK', data);
}

export function logPostSuccessChainStartSource(
  data: LobbyBansDiagFields & {
    source: string;
    outcome: string;
    reason: string;
    nextOverlayKind: string | null;
    nextOverlayBanId: string | null;
    itemSource: string;
  } & Record<string, unknown>,
): void {
  emit('POST_SUCCESS_CHAIN_START_SOURCE', data);
}
