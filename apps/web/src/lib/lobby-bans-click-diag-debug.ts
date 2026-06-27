'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type LobbyBansClickSelectedAction =
  | 'drain'
  | 'open-section'
  | 'ignored'
  | 'pending-drain-call';

export type LobbyBansClickDiagPayload = {
  t?: number;
  lobbyBansNeedAttention?: boolean | number;
  lobbyBansAttentionHint?: number;
  ownerPrimaryShellPendingLen?: number;
  ownerPrimaryShellQueueLen?: number;
  ownerPendingLen?: number;
  ownerQueueLen?: number;
  pendingStartupInteractionsLen?: number;
  refQueueLen?: number;
  refPendingLen?: number;
  pendingChainPrefetchInFlight?: number;
  notificationDrainActive?: boolean;
  selectedAction?: LobbyBansClickSelectedAction;
  reason?: string;
  phase?: string;
  indicatorTrueButQueueEmpty?: boolean;
  [key: string]: unknown;
};

export function logLobbyBansClick(payload: LobbyBansClickDiagPayload): void {
  emit('[LOBBY BANS CLICK]', { t: performance.now(), ...payload });
}

export function logLobbyBansClickDecision(payload: Record<string, unknown>): void {
  emit('[LOBBY BANS CLICK DECISION]', { t: performance.now(), ...payload });
}

export function logQueueReadyForDrain(payload: Record<string, unknown>): void {
  emit('[QUEUE READY FOR DRAIN]', { t: performance.now(), ...payload });
}
