'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

const LOBBY_INDICATOR_PREFETCH_SOURCES = new Set([
  'lobby-indicator-prime',
]);

const LOBBY_INDICATOR_PRIME_ONLY_SOURCES = new Set([
  'lobby-indicator-prime-sync',
  'lobby-indicator-prime-after-prefetch',
  'auth-ready-layout',
  'apply-session',
  'defer-pending-startup',
]);

export function isLobbyIndicatorPrefetchSource(source: string): boolean {
  return LOBBY_INDICATOR_PREFETCH_SOURCES.has(source);
}

export function isLobbyIndicatorPrimeOnlySource(source: string): boolean {
  return (
    LOBBY_INDICATOR_PREFETCH_SOURCES.has(source) ||
    LOBBY_INDICATOR_PRIME_ONLY_SOURCES.has(source) ||
    source.startsWith('lobby-indicator-prime')
  );
}

export function logLobbyIndicatorPrimeStart(data?: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR PRIME START]', data);
}

export function logLobbyIndicatorPrimeReady(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR PRIME READY]', data);
}

export function logLobbyIndicatorPrimeOnly(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR PRIME ONLY]', data);
}

export function logLobbyIndicatorPrefetchNoOverlay(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY INDICATOR PREFETCH NO OVERLAY]', data);
}

export function logLobbyIndicatorOpenedCardBug(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY INDICATOR OPENED CARD BUG]', data);
}

export function logLobbyIndicatorOpenedEmptyHostBug(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY INDICATOR OPENED EMPTY HOST BUG]', data);
}

export function logResultPollOpenedEmptyHostBug(
  data: Record<string, unknown>,
): void {
  emit('[RESULT POLL OPENED EMPTY HOST BUG]', data);
}

export function logLobbyIndicatorDelayBug(data: Record<string, unknown>): void {
  emit('[LOBBY INDICATOR DELAY BUG]', data);
}
