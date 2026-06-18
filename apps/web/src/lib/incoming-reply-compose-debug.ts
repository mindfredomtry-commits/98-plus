'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logIncomingReplyActionStart(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING REPLY ACTION START]', data);
}

export function logIncomingReplyClearActiveHold(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING REPLY CLEAR ACTIVE HOLD]', data);
}

export function logIncomingReplyOverlayClosed(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING REPLY OVERLAY CLOSED]', data);
}

export function logIncomingReplyFlowStart(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING REPLY FLOW START]', data);
}

export function logConfirmEnterNotificationGuardClear(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM ENTER NOTIFICATION GUARD CLEAR]', data);
}

export function logConfirmBlockedByActiveUserCardBug(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM BLOCKED BY ACTIVE USER CARD BUG]', data);
}
