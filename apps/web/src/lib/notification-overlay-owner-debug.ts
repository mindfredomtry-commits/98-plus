'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOwnerShadowEvent(data: Record<string, unknown>): void {
  emit('[OWNER SHADOW EVENT]', data);
}

export function logOwnerShadowState(data: Record<string, unknown>): void {
  emit('[OWNER SHADOW STATE]', data);
}

export function logOwnerShadowEffect(data: Record<string, unknown>): void {
  emit('[OWNER SHADOW EFFECT]', data);
}

export function logOwnerShadowMismatch(data: Record<string, unknown>): void {
  emit('[OWNER SHADOW MISMATCH]', data);
}
