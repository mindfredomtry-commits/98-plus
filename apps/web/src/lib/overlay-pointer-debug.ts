'use client';

export function logOverlayButtonPointerDown(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[OVERLAY BUTTON POINTER DOWN]', data);
}

export function logOverlayButtonClick(data: Record<string, unknown>): void {
  window.__debug98log?.('[OVERLAY BUTTON CLICK]', data);
}

export function logOverlayCardHitOk(data: Record<string, unknown>): void {
  window.__debug98log?.('[OVERLAY CARD HIT OK]', data);
}

export function logBackdropHitBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[BACKDROP HIT BUG]', data);
}

export function logCardPointerEventsBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[CARD POINTER EVENTS BUG]', data);
}

export function verifyOverlayCardPointerHit(
  cardEl: HTMLElement | null,
  banId: string,
  kind: string,
): void {
  if (!cardEl || typeof document === 'undefined') {
    logCardPointerEventsBug({
      banId,
      kind,
      reason: 'no-card-el',
    });
    return;
  }

  const cardRect = cardEl.getBoundingClientRect();
  const probeX = cardRect.left + cardRect.width / 2;
  const probeY = cardRect.top + Math.min(cardRect.height * 0.75, 160);
  const topEl = document.elementFromPoint(probeX, probeY);
  const cardHit =
    topEl != null && (cardEl === topEl || cardEl.contains(topEl));

  if (!cardHit) {
    const topClass =
      topEl instanceof HTMLElement ? topEl.className.slice(0, 160) : null;
    if (
      topEl instanceof HTMLElement &&
      (topClass?.includes('backdrop') ||
        topClass?.includes('check-direct-backdrop') ||
        topClass?.includes('session-backdrop'))
    ) {
      logBackdropHitBug({
        banId,
        kind,
        probeX,
        probeY,
        topTag: topEl.tagName,
        topClass,
      });
    } else {
      logCardPointerEventsBug({
        banId,
        kind,
        probeX,
        probeY,
        topTag: topEl?.tagName ?? null,
        topClass,
      });
    }
    return;
  }

  let node: HTMLElement | null = cardEl;
  while (node && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (style.pointerEvents === 'none') {
      logCardPointerEventsBug({
        banId,
        kind,
        reason: 'ancestor-pointer-events-none',
        element: node.tagName,
        className:
          typeof node.className === 'string'
            ? node.className.slice(0, 160)
            : null,
      });
      return;
    }
    node = node.parentElement;
  }

  const cardStyle = window.getComputedStyle(cardEl);
  if (cardStyle.pointerEvents === 'none') {
    logCardPointerEventsBug({
      banId,
      kind,
      reason: 'card-pointer-events-none',
    });
    return;
  }

  logOverlayCardHitOk({ banId, kind, probeX, probeY });
}
