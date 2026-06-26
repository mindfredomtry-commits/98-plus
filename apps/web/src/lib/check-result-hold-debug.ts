'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logCheckResultHoldStarted(data: Record<string, unknown>): void {
  emit('[CHECK RESULT HOLD STARTED]', data);
}

export function logCheckResultHoldReleasedWithResult(
  data: Record<string, unknown>,
): void {
  emit('[CHECK RESULT HOLD RELEASED WITH RESULT]', data);
}

export function logCheckResultHoldReleasedTimeout(
  data: Record<string, unknown>,
): void {
  emit('[CHECK RESULT HOLD RELEASED TIMEOUT]', data);
}

export function logCheckResultArrivedDuringHold(
  data: Record<string, unknown>,
): void {
  emit('[CHECK RESULT ARRIVED DURING HOLD]', data);
}

export function logCheckResultLateBlocked(data: Record<string, unknown>): void {
  emit('[CHECK RESULT LATE BLOCKED]', data);
}

export function logCheckResultLateQueuedAfterHead(
  data: Record<string, unknown>,
): void {
  emit('[CHECK RESULT LATE QUEUED AFTER HEAD]', data);
}

export function logCheckResultAdvanceBlocked(
  data: Record<string, unknown>,
): void {
  emit('[CHECK RESULT ADVANCE BLOCKED]', data);
}
