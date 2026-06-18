'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logIncomingOverboardAtomicResult(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING OVERBOARD ATOMIC RESULT]', data);
}

export function logResultCardStableHold(data: Record<string, unknown>): void {
  emit('[RESULT CARD STABLE HOLD]', data);
}

export function logResultCardRemountBug(data: Record<string, unknown>): void {
  emit('[RESULT CARD REMOUNT BUG]', data);
}

export function logResultCardClearedBug(data: Record<string, unknown>): void {
  emit('[RESULT CARD CLEARED BUG]', data);
}

export function logResultCardFlickerBug(data: Record<string, unknown>): void {
  emit('[RESULT CARD FLICKER BUG]', data);
}

export function logResultCardPreserveDomOk(data: Record<string, unknown>): void {
  emit('[RESULT CARD PRESERVE DOM OK]', data);
}
