'use client';

export function logResultPollHit(data: Record<string, unknown>): void {
  window.__debug98log?.('[RESULT POLL HIT]', data);
}

export function logResultPollItemBuilt(data: Record<string, unknown>): void {
  window.__debug98log?.('[RESULT POLL ITEM BUILT]', data);
}

export function logResultPollDropStaleCheck(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[RESULT POLL DROP STALE CHECK]', data);
}

export function logResultPollPrioritySet(data: Record<string, unknown>): void {
  window.__debug98log?.('[RESULT POLL PRIORITY SET]', data);
}

export function logResultPollShowResultCard(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[RESULT POLL SHOW RESULT CARD]', data);
}

export function logCheckPrimeSkipStaleBecauseResultExists(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK PRIME SKIP STALE BECAUSE RESULT EXISTS]', data);
}

export function logResultCardMounted(data: Record<string, unknown>): void {
  window.__debug98log?.('[RESULT CARD MOUNTED]', data);
}

export function logCheckCardMountedBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD MOUNTED BUG]', data);
}
