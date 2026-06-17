'use client';

export type CheckStartupBlockersSnapshot = {
  isBooting: boolean;
  isLobbyBootVisible: boolean;
  isRouteTransitioning: boolean;
  isOverlayLocked: boolean;
  isNotificationQueueLocked: boolean;
  isAdvancingQueue: boolean;
  dimVisible: boolean;
  blurVisible: boolean;
};

export function logCheckStartupBlockers(
  snapshot: CheckStartupBlockersSnapshot,
  extra?: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK ACTIVE BLOCKERS]', { ...snapshot, ...extra });
}

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

/** @deprecated use logCheckCardSelected */
export function logCheckDeeplinkCardSelected(
  data: Record<string, unknown>,
): void {
  logCheckCardSelected(data);
}

export function logCheckCardSelected(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD SELECTED]', data);
}

export function logCheckStartupBlockersClear(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK STARTUP BLOCKERS CLEAR]', data);
}

/** @deprecated use logCheckCardOverlaySet */
export function logCheckDeeplinkOverlaySet(data: Record<string, unknown>): void {
  logCheckCardOverlaySet(data);
}

export function logCheckCardOverlaySet(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD OVERLAY SET]', data);
}

/** @deprecated use logCheckCardMounted */
export function logCheckDeeplinkCardMounted(data: Record<string, unknown>): void {
  logCheckCardMounted(data);
}

export function logCheckCardMounted(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD MOUNTED]', data);
}

export function logCheckCardTopLayerOk(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD TOP LAYER OK]', data);
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

export function logCheckDeeplinkLobbySuppressed(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DEEPLINK LOBBY SUPPRESSED]', data);
}

export function logCheckFullLobbyFlashBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK FULL LOBBY FLASH BUG]', data);
}

export function logCheckWrongBootPlaceholderBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK WRONG BOOT PLACEHOLDER BUG]', data);
}

/** @deprecated boot-hold removed — use logCheckFullLobbyFlashBug */
export function logCheckDeeplinkLobbyFlashBug(
  data: Record<string, unknown>,
): void {
  logCheckFullLobbyFlashBug(data);
}
