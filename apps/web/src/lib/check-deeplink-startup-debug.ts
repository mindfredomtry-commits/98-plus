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

export function logCheckDirectBackdropRendered(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DIRECT BACKDROP RENDERED]', data);
}

export function logCheckDirectBackdropUnderCardOk(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DIRECT BACKDROP UNDER CARD OK]', data);
}

export function logCheckDirectBackdropMissingBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DIRECT BACKDROP MISSING BUG]', data);
}

export function logCheckDirectBackdropAboveCardBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK DIRECT BACKDROP ABOVE CARD BUG]', data);
}

export function verifyCheckDirectBackdropLayers(
  backdropEl: HTMLElement | null,
  cardEl: HTMLElement | null,
  banId: string,
): void {
  if (!backdropEl || !cardEl) {
    logCheckDirectBackdropMissingBug({
      banId,
      reason: !backdropEl ? 'no-backdrop-el' : 'no-card-el',
    });
    return;
  }
  logCheckDirectBackdropRendered({ banId });
  const backdropStyle = window.getComputedStyle(backdropEl);
  const bg = backdropStyle.backgroundColor;
  const opacity = Number.parseFloat(backdropStyle.opacity);
  const backdropVisible =
    opacity > 0.05 &&
    bg !== 'transparent' &&
    bg !== 'rgba(0, 0, 0, 0)';
  if (!backdropVisible) {
    logCheckDirectBackdropMissingBug({
      banId,
      reason: 'backdrop-not-visible',
      bg,
      opacity,
    });
    return;
  }
  const cardRect = cardEl.getBoundingClientRect();
  const probeX = cardRect.left + cardRect.width / 2;
  const probeY = cardRect.top + Math.min(cardRect.height * 0.35, 120);
  const topEl = document.elementFromPoint(probeX, probeY);
  const cardOnTop =
    topEl != null && (cardEl === topEl || cardEl.contains(topEl));
  if (!cardOnTop) {
    logCheckDirectBackdropAboveCardBug({
      banId,
      probeX,
      probeY,
      topTag: topEl?.tagName ?? null,
      topClass: topEl?.className ?? null,
    });
    return;
  }
  logCheckDirectBackdropUnderCardOk({ banId });
}
