'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logPostSuccessDrainStart(data: Record<string, unknown>): void {
  emit('[POST SUCCESS DRAIN START]', data);
}

export function logPostSuccessDrainDecision(
  data: Record<string, unknown>,
): void {
  emit('[POST SUCCESS DRAIN DECISION]', data);
}

export function logPostSuccessFirstNotification(
  data: Record<string, unknown>,
): void {
  emit('[POST SUCCESS FIRST NOTIFICATION]', data);
}

export function logPostSuccessDrainEmpty(data: Record<string, unknown>): void {
  emit('[POST SUCCESS DRAIN EMPTY]', data);
}

export function logPostSuccessNoAccessRoute(
  data: Record<string, unknown>,
): void {
  emit('[POST SUCCESS NO ACCESS ROUTE]', data);
}
