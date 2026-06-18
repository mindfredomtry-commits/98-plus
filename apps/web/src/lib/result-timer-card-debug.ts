'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultTimerButtonPointerDown(
  data: Record<string, unknown>,
): void {
  emit('[RESULT TIMER BUTTON POINTER DOWN]', data);
}

export function logResultTimerButtonClick(data: Record<string, unknown>): void {
  emit('[RESULT TIMER BUTTON CLICK]', data);
}

export function logResultTimerGoToBansClick(data: Record<string, unknown>): void {
  emit('[RESULT TIMER GO TO BANS CLICK]', data);
}

export function logResultTimerReplyClick(data: Record<string, unknown>): void {
  emit('[RESULT TIMER REPLY CLICK]', data);
}

export function logResultTimerInputBlockedBug(
  data: Record<string, unknown>,
): void {
  emit('[RESULT TIMER INPUT BLOCKED BUG]', data);
}

export function logResultTimerActionAllowed(data: Record<string, unknown>): void {
  emit('[RESULT TIMER ACTION_ALLOWED]', data);
}

export function logResultTimerDismissContinueQueue(
  data: Record<string, unknown>,
): void {
  emit('[RESULT TIMER DISMISS CONTINUE_QUEUE]', data);
}
