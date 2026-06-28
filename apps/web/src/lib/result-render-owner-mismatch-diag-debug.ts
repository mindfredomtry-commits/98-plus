'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logQueueHeadSelectedForDisplay(
  payload: Record<string, unknown>,
): void {
  emit('[QUEUE HEAD SELECTED FOR DISPLAY]', payload);
}

export function logOwnerDisplaySetFromQueue(
  payload: Record<string, unknown>,
): void {
  emit('[OWNER DISPLAY SET FROM QUEUE]', payload);
}

export function logResultRenderVsOwnerActive(
  payload: Record<string, unknown>,
): void {
  emit('[RESULT RENDER VS OWNER ACTIVE]', payload);
}

export function logGoToBansActiveMismatch(
  payload: Record<string, unknown>,
): void {
  emit('[GO TO BANS ACTIVE MISMATCH]', payload);
}
