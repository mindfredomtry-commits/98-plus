'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOverkillTerminalLock(data: Record<string, unknown>): void {
  emit('[OVERKILL TERMINAL LOCK]', data);
}

export function logNormalResultSkippedAfterOverkill(
  data: Record<string, unknown>,
): void {
  emit('[NORMAL RESULT SKIPPED AFTER OVERKILL]', data);
}

export function logDuplicateTerminalResultAttempt(
  data: Record<string, unknown>,
): void {
  emit('[DUPLICATE TERMINAL RESULT ATTEMPT]', data);
}

export function logResultTypeConflict(data: Record<string, unknown>): void {
  emit('[RESULT TYPE CONFLICT]', data);
}
