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

export type SharedPrefetchLifecycleEvent =
  | 'created'
  | 'reused'
  | 'resolved'
  | 'cleared';

export type SharedPrefetchPromiseState = 'none' | 'active' | 'settled';

export type LobbyBansClickDiagPayload = {
  t?: number;
  lobbyBansNeedAttention?: boolean | number;
  lobbyBansAttentionHint?: number;
  ownerPrimaryShellPendingLen?: number;
  ownerPrimaryShellQueueLen?: number;
  ownerPendingLen?: number;
  ownerQueueLen?: number;
  pendingStartupInteractionsLen?: number;
  overlayQueueLen?: number;
  refQueueLen?: number;
  refPendingLen?: number;
  hasPendingNotificationChain?: boolean;
  pendingChainPrefetchInFlight?: number;
  hasSharedPrefetchPromise?: boolean;
  sharedPrefetchPromiseState?: SharedPrefetchPromiseState;
  notificationDrainActive?: boolean;
  selectedAction?: LobbyBansClickSelectedAction;
  reason?: string;
  phase?: string;
  indicatorTrueButQueueEmpty?: boolean;
  ownerRefPendingMismatch?: boolean;
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

export function logSharedPrefetchLifecycle(payload: {
  event: SharedPrefetchLifecycleEvent;
  source?: string;
  result?: boolean;
  refQueueLen?: number;
  refPendingLen?: number;
  ownerPendingLen?: number;
  ownerQueueLen?: number;
  pendingChainPrefetchInFlight?: number;
  hasSharedPrefetchPromise?: boolean;
  [key: string]: unknown;
}): void {
  emit('[SHARED PREFETCH LIFECYCLE]', { t: performance.now(), ...payload });
}

export function logCommitPendingQueueViaOwner(payload: Record<string, unknown>): void {
  emit('[COMMIT PENDING QUEUE VIA OWNER]', { t: performance.now(), ...payload });
}

export type DrainGateDecisionSource = 'owner' | 'legacy' | 'fallback';

export function logDrainGateSource(payload: {
  phase: string;
  source: DrainGateDecisionSource;
  ownerPending: number;
  ownerQueue: number;
  legacyPending: number;
  legacyQueue: number;
  selectedAction: 'drain' | 'open-section';
  reason?: string;
  [key: string]: unknown;
}): void {
  emit('[DRAIN GATE SOURCE]', { t: performance.now(), ...payload });
}
