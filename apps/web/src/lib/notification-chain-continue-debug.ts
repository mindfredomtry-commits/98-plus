'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logChainContinueStart(data: Record<string, unknown>): void {
  emit('[CHAIN CONTINUE START]', data);
}

export function logChainContinueCollected(
  data: Record<string, unknown>,
): void {
  emit('[CHAIN CONTINUE COLLECTED]', data);
}

export function logChainContinueShowNext(data: Record<string, unknown>): void {
  emit('[CHAIN CONTINUE SHOW NEXT]', data);
}

export function logChainContinueEmptyOpenLobby(
  data: Record<string, unknown>,
): void {
  emit('[CHAIN CONTINUE EMPTY OPEN LOBBY]', data);
}

export function logChainContinueLostPendingBug(
  data: Record<string, unknown>,
): void {
  emit('[CHAIN CONTINUE LOST PENDING BUG]', data);
}

export function logLobbyOpenBlockedChainNotEmpty(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY OPEN BLOCKED CHAIN NOT EMPTY]', data);
}

export function logChainContinueBlockedNonExplicitStartup(
  data: Record<string, unknown>,
): void {
  emit('[CHAIN CONTINUE BLOCKED NON EXPLICIT STARTUP]', data);
}
