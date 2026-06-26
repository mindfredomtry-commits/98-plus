'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOverboardResultContinueRequested(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT CONTINUE REQUESTED]', data);
}

export function logOverboardResultChainContext(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT CHAIN CONTEXT]', data);
}

export function logOverboardResultEndedChain(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT ENDED CHAIN]', data);
}

export function logOverboardResultContinueNext(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT CONTINUE NEXT]', data);
}

export function logOverboardResultOpenedLobby(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT OPENED LOBBY]', data);
}

export function logOverboardResultQueueSessionDropped(
  data: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT QUEUE SESSION DROPPED]', data);
}
