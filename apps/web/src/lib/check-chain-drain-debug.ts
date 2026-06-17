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
