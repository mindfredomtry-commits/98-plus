'use client';

export function logCheckAnswerClick(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK ANSWER CLICK]', data);
}

export function logOverlayMarkDismissing(data: Record<string, unknown>): void {
  window.__debug98log?.('[OVERLAY MARK DISMISSING]', data);
}

export function logOverlayActiveCleared(data: Record<string, unknown>): void {
  window.__debug98log?.('[OVERLAY ACTIVE CLEARED]', data);
}

export function logChainDrainUserAnswerAllowed(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHAIN DRAIN USER ANSWER ALLOWED]', data);
}

export function logChainDrainContinue(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHAIN DRAIN CONTINUE]', data);
}

export function logChainEmptyFallbackLobby(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHAIN EMPTY FALLBACK LOBBY]', data);
}

export function logCheckAnswerSubmitOk(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK ANSWER SUBMIT OK]', data);
}

export function logCheckAnswerFinalResultFound(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT FOUND]', data);
}

export function logCheckAnswerFinalResultFetchStart(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT FETCH START]', data);
}

export function logCheckAnswerFinalResultFetchOk(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT FETCH OK]', data);
}

export function logCheckAnswerFinalResultEnqueued(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT ENQUEUED]', data);
}

export function logCheckAnswerFinalResultShow(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT SHOW]', data);
}

export function logCheckAnswerFinalResultMissing(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER FINAL RESULT MISSING]', data);
}

export function logCheckAnswerResultSkippedBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ANSWER RESULT SKIPPED BUG]', data);
}
