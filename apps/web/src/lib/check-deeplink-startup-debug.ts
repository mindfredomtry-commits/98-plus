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

export function logCheckBackdropBelowCard(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK BACKDROP BELOW CARD]', data);
}

export function logCheckCardNotBlurred(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD NOT BLURRED]', data);
}

export function logCheckBackdropAboveCardBug(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHECK BACKDROP ABOVE CARD BUG]', data);
}

export function logCheckCardInsideBlurBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[CHECK CARD INSIDE BLUR BUG]', data);
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
  logCheckBackdropBelowCard({ banId });
}

/** Verify session-backdrop is sibling below card (not wrapping it). */
export function verifyCheckSessionBackdropLayers(
  layerEl: HTMLElement | null,
  banId: string,
): void {
  if (!layerEl) {
    logCheckDirectBackdropMissingBug({ banId, reason: 'no-layer-el' });
    return;
  }

  const sessionBackdrop = layerEl.querySelector(
    '.app-notification-layer__session-backdrop',
  ) as HTMLElement | null;
  const content = layerEl.querySelector(
    '.app-notification-layer__content',
  ) as HTMLElement | null;
  const card = content?.querySelector('.modal-card') as HTMLElement | null;
  const nestedModalBackdrop = content?.querySelector(
    '.modal-backdrop',
  ) as HTMLElement | null;

  if (!sessionBackdrop || !card) {
    logCheckDirectBackdropMissingBug({
      banId,
      reason: !sessionBackdrop ? 'no-session-backdrop' : 'no-card-el',
    });
    return;
  }

  if (nestedModalBackdrop?.contains(card)) {
    logCheckCardInsideBlurBug({
      banId,
      reason: 'card-inside-modal-backdrop',
    });
    return;
  }

  if (sessionBackdrop.contains(card)) {
    logCheckCardInsideBlurBug({
      banId,
      reason: 'card-inside-session-backdrop',
    });
    return;
  }

  const backdropStyle = window.getComputedStyle(sessionBackdrop);
  const cardStyle = window.getComputedStyle(card);
  const cardFilter = cardStyle.filter;
  const cardBackdropFilter = cardStyle.backdropFilter;
  const cardOpacity = Number.parseFloat(cardStyle.opacity);
  const cardInsideBlurredParent = (() => {
    let node: HTMLElement | null = card.parentElement;
    while (node && node !== layerEl) {
      const style = window.getComputedStyle(node);
      if (
        style.backdropFilter !== 'none' ||
        style.filter !== 'none' ||
        (Number.parseFloat(style.opacity) < 0.99 && node !== content)
      ) {
        return {
          tag: node.tagName,
          className: node.className,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          opacity: style.opacity,
        };
      }
      node = node.parentElement;
    }
    return null;
  })();

  if (cardInsideBlurredParent) {
    logCheckCardInsideBlurBug({
      banId,
      ...cardInsideBlurredParent,
    });
    return;
  }

  const cardRect = card.getBoundingClientRect();
  const probeX = cardRect.left + cardRect.width / 2;
  const probeY = cardRect.top + Math.min(cardRect.height * 0.35, 120);
  const topEl = document.elementFromPoint(probeX, probeY);
  const cardOnTop =
    topEl != null && (card === topEl || card.contains(topEl));

  if (!cardOnTop) {
    logCheckBackdropAboveCardBug({
      banId,
      probeX,
      probeY,
      topTag: topEl?.tagName ?? null,
      topClass:
        topEl instanceof HTMLElement ? topEl.className.slice(0, 120) : null,
    });
    logCheckDirectBackdropAboveCardBug({
      banId,
      probeX,
      probeY,
      topTag: topEl?.tagName ?? null,
    });
    return;
  }

  const backdropZ = Number.parseInt(backdropStyle.zIndex, 10) || 0;
  const contentZ = content
    ? Number.parseInt(window.getComputedStyle(content).zIndex, 10) || 0
    : 0;
  if (contentZ < backdropZ) {
    logCheckBackdropAboveCardBug({
      banId,
      reason: 'content-z-below-backdrop',
      backdropZ,
      contentZ,
    });
    return;
  }

  if (
    cardFilter !== 'none' ||
    cardBackdropFilter !== 'none' ||
    cardOpacity < 0.95
  ) {
    logCheckCardInsideBlurBug({
      banId,
      reason: 'card-filter-or-opacity',
      filter: cardFilter,
      backdropFilter: cardBackdropFilter,
      opacity: cardOpacity,
    });
    return;
  }

  logCheckBackdropBelowCard({ banId });
  logCheckCardNotBlurred({ banId });
  logCheckDirectBackdropUnderCardOk({ banId });
}
