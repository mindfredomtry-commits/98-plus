'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logLobbyIndicatorPrimeStart(data?: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR PRIME START]', data);
}

export function logLobbyIndicatorPrimeReady(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR PRIME READY]', data);
}

export function logLobbyIndicatorDelayBug(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR DELAY BUG]', data);
}
