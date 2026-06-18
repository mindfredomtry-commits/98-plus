'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultNextPayloadReady(data: Record<string, unknown>): void {
  emit('[RESULT NEXT PAYLOAD READY]', data);
}

export function logResultNextPayloadMissingBug(
  data: Record<string, unknown>,
): void {
  emit('[RESULT NEXT PAYLOAD MISSING BUG]', data);
}

export function logResultCardAutoClearedBug(data: Record<string, unknown>): void {
  emit('[RESULT CARD AUTO CLEARED BUG]', data);
}

export function logSuccessDrainResultCardMounted(
  data: Record<string, unknown>,
): void {
  emit('[SUCCESS DRAIN RESULT CARD MOUNTED]', data);
}

export function logSuccessDrainResultLostBug(
  data: Record<string, unknown>,
): void {
  emit('[SUCCESS DRAIN RESULT LOST BUG]', data);
}

export function logLobbyCtaHiddenBug(data: Record<string, unknown>): void {
  emit('[LOBBY CTA HIDDEN BUG]', data);
}

export function isSuccessExitDrainSource(source: string): boolean {
  return (
    source === 'success-exit' ||
    source === 'success-exit-retry' ||
    source.startsWith('success-exit')
  );
}
