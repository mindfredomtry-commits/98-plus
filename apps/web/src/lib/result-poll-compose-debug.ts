'use client';

import { readConfirmOrbDebugSnapshot } from '@/lib/confirm-orb-snapshot-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logResultPollDuringCompose(
  data: Record<string, unknown>,
): void {
  emit('[RESULT POLL DURING COMPOSE]', data);
}

export type ResultPollComposeGuardFields = {
  whatOrConfirmActive: boolean;
  sendComposePhase: string;
  confirmActive: boolean;
  instantBanOpen: boolean;
  flowMode: string;
  replyComposeActive: boolean;
};

export function shouldSkipResultPollDuringActiveCompose(
  fields: ResultPollComposeGuardFields,
): boolean {
  if (fields.whatOrConfirmActive) return true;
  if (fields.sendComposePhase === 'composingBan') return true;
  if (fields.confirmActive) return true;
  if (fields.replyComposeActive) return true;
  if (
    fields.instantBanOpen &&
    (fields.flowMode === 'incoming-reply' || fields.flowMode === 'reply')
  ) {
    return true;
  }
  return false;
}

export function logResultPollSkippedDuringCompose(
  data: Record<string, unknown>,
): void {
  emit('[RESULT POLL SKIPPED DURING COMPOSE]', data);
}

export function logResultPollBlockerCheck(
  data: Record<string, unknown>,
): void {
  emit('[RESULT POLL BLOCKER CHECK]', data);
}

export function logConfirmOrbAfterResultPoll(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM ORB AFTER RESULT POLL]', {
    orbSnapshot: readConfirmOrbDebugSnapshot(),
    ...data,
  });
}

export function logResultPollComposeDiagnostics(
  source: string,
  banId: string,
  status: string | null | undefined,
  composeFields: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  const confirmActive = composeFields.confirmActive === true;
  const whatOrConfirmActive = composeFields.whatOrConfirmActive === true;
  if (!confirmActive && !whatOrConfirmActive) return;

  const payload = {
    source,
    banId,
    status: status ?? null,
    ...composeFields,
    ...extra,
  };
  logResultPollDuringCompose(payload);
  logConfirmOrbAfterResultPoll(payload);
}
