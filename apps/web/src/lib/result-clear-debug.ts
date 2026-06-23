'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultAutoClearDecision(data: {
  currentResultId: string | null;
  resultRefId: string | null;
  heldResultId: string | null;
  queueHeadId: string | null;
  activeOverlayKind: string | null;
  activeOverlayBanId: string | null;
  reason: string;
  refMismatch: boolean;
  willClear: boolean;
}): void {
  emit('[RESULT AUTO CLEAR DECISION]', data);
}

export function logResultClearCallsite(data: {
  source: string;
  reason: string;
  resultIdBefore: string | null;
  heldKindBefore: string | null;
  heldResultIdBefore: string | null;
  queueHeadKindBefore: string | null;
  queueHeadBanIdBefore: string | null;
  activeOverlayKind: string | null;
  notificationQueueLocked: boolean;
  notificationChainAwaitingUser: boolean;
  willClearResult: boolean;
  willClearHeld: boolean;
  willPruneQueue: boolean;
}): void {
  emit('[RESULT CLEAR CALLSITE]', data);
}

export function logResultHeldStillPresentAfterClear(data: {
  source: string;
  reason: string;
  resultIdAfter: string | null;
  resultRefIdAfter: string | null;
  heldKindAfter: string | null;
  heldResultIdAfter: string | null;
  queueHeadKindAfter: string | null;
  queueHeadBanIdAfter: string | null;
  resultStateStillPresent: boolean;
  heldStillPresent: boolean;
  queueHeadResultStillPresent: boolean;
}): void {
  emit('[RESULT HELD STILL PRESENT AFTER CLEAR]', data);
}

export function logResultStaleGuardBlocked(data: {
  banId: string;
  source: string;
  blockReason: string;
  freshAction: boolean;
  consumed: boolean;
  delivered: boolean;
  dismissed: boolean;
  shown: boolean;
}): void {
  emit('[RESULT STALE GUARD BLOCKED]', data);
}

export function logResultStaleGuardBypassedFreshCheckAnswer(
  data: Record<string, unknown>,
): void {
  emit('[RESULT STALE GUARD BYPASSED FRESH CHECK ANSWER]', data);
}

export function logFreshResultOverlayStackTrace(
  data: Record<string, unknown>,
): void {
  emit('[FRESH RESULT OVERLAY STACK TRACE]', data);
}
