'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logIncomingNextPayloadReady(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING NEXT PAYLOAD READY]', data);
}

export function logIncomingNextPayloadMissingBug(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING NEXT PAYLOAD MISSING BUG]', data);
}

export function logIncomingNextHydrateStart(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING NEXT HYDRATE START]', data);
}

export function logIncomingNextHydrateOk(data: Record<string, unknown>): void {
  emit('[INCOMING NEXT HYDRATE OK]', data);
}

export function logIncomingCardRenderBlockedBug(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING CARD RENDER BLOCKED BUG]', data);
}

export function logEmptyIncomingShellBug(data: Record<string, unknown>): void {
  emit('[EMPTY INCOMING SHELL BUG]', data);
}
