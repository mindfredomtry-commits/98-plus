'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logIncomingConsumedAfterOverkill(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING CONSUMED AFTER OVERKILL]', data);
}

export function logResultContinueAfterOverkill(
  data: Record<string, unknown>,
): void {
  emit('[RESULT CONTINUE AFTER OVERKILL]', data);
}

export function logOverkillParentIncomingStillInQueue(
  data: Record<string, unknown>,
): void {
  emit('[OVERKILL PARENT INCOMING STILL IN QUEUE]', data);
}

export function logOverkillParentIncomingRejected(
  data: Record<string, unknown>,
): void {
  emit('[OVERKILL PARENT INCOMING REJECTED]', data);
}

export function logQueueHeadAfterResultContinue(
  data: Record<string, unknown>,
): void {
  emit('[QUEUE HEAD AFTER RESULT CONTINUE]', data);
}
