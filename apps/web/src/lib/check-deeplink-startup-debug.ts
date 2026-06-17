'use client';

export function logCheckDeeplinkStart(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK START]', data);
}

export function logCheckDeeplinkPayloadParsed(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK PAYLOAD PARSED]', data);
}

export function logCheckDeeplinkAuthWait(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK AUTH WAIT]', data);
}

export function logCheckDeeplinkFetchStart(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK FETCH START]', data);
}

export function logCheckDeeplinkFetchOk(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK FETCH OK]', data);
}

export function logCheckDeeplinkFetchError(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK FETCH ERROR]', data);
}

export function logCheckDeeplinkCardSelected(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK CARD SELECTED]', data);
}

export function logCheckDeeplinkOverlaySet(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK OVERLAY SET]', data);
}

export function logCheckDeeplinkCardMounted(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK DEEPLINK CARD MOUNTED]', data);
}

export function logCheckDeeplinkFallbackLobby(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK FALLBACK LOBBY]', data);
}

export function logCheckDeeplinkAuthReadyResume(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK AUTH READY RESUME]', data);
}

export function logCheckDeeplinkResumeSkip(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK RESUME SKIP]', data);
}

export function logCheckDeeplinkBootHoldStart(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK BOOT HOLD START]', data);
}

export function logCheckDeeplinkBootHoldActive(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK BOOT HOLD ACTIVE]', data);
}

export function logCheckDeeplinkBootHoldRelease(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK BOOT HOLD RELEASE]', data);
}

export function logCheckDeeplinkLobbySuppressed(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK LOBBY SUPPRESSED]', data);
}

export function logCheckDeeplinkLobbyFlashBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK LOBBY FLASH BUG]', data);
}
