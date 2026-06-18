'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultGoToBansClick(data: Record<string, unknown>): void {
  emit('[RESULT GO_TO_BANS CLICK]', data);
}

export function logResultGoToBansClearActiveHold(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS CLEAR ACTIVE HOLD]', data);
}

export function logResultGoToBansRemainingQueue(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS REMAINING QUEUE]', data);
}

export function logResultGoToBansShowNext(data: Record<string, unknown>): void {
  emit('[RESULT GO_TO_BANS SHOW NEXT]', data);
}

export function logResultGoToBansOpenBansSection(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS OPEN BANS SECTION]', data);
}

export function logResultGoToBansEmptyScreenBug(
  data: Record<string, unknown>,
): void {
  emit('[RESULT GO_TO_BANS EMPTY SCREEN BUG]', data);
}
