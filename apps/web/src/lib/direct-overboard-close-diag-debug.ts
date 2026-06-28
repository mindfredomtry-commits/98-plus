'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOverboardResultCtaClick(
  payload: Record<string, unknown>,
): void {
  emit('[OVERBOARD RESULT CTA CLICK]', payload);
}

export function logDirectOverboardCloseRequest(
  payload: Record<string, unknown>,
): void {
  emit('[DIRECT OVERBOARD CLOSE REQUEST]', payload);
}

export function logDirectOverboardCloseCommit(
  payload: Record<string, unknown>,
): void {
  emit('[DIRECT OVERBOARD CLOSE COMMIT]', payload);
}

export function logDirectOverboardShowableDecision(
  payload: Record<string, unknown>,
): void {
  emit('[DIRECT OVERBOARD SHOWABLE DECISION]', payload);
}
