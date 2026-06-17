'use client';

export function verifyOverlayCardLayout(
  cardEl: HTMLElement | null,
  opts?: { banId?: string | null; kind?: string },
): void {
  if (typeof window === 'undefined' || !cardEl) return;

  const rect = cardEl.getBoundingClientRect();
  const viewportHeight =
    window.visualViewport?.height ?? window.innerHeight ?? 0;
  const safeTop = 0;
  const safeBottom = viewportHeight;
  const clippedTop = rect.top < safeTop - 1;
  const clippedBottom = rect.bottom > safeBottom + 1;

  if (clippedTop || clippedBottom) {
    window.__debug98log?.('[OVERLAY CARD CLIPPED BUG]', {
      banId: opts?.banId ?? null,
      kind: opts?.kind ?? null,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      viewportHeight: Math.round(viewportHeight),
      clippedTop,
      clippedBottom,
    });
    return;
  }

  window.__debug98log?.('[OVERLAY CARD LAYOUT OK]', {
    banId: opts?.banId ?? null,
    kind: opts?.kind ?? null,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    viewportHeight: Math.round(viewportHeight),
  });
}
