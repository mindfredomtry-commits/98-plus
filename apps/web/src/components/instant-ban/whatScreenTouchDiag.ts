'use client';

let touchDiagCached: boolean | null = null;
let whatHitDebugCached: boolean | null = null;

/** Dev build or `?chipDebug=1` on the mini-app URL (works on phone). */
export function isWhatTouchDiagEnabled(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  if (touchDiagCached !== null) return touchDiagCached;
  touchDiagCached =
    process.env.NODE_ENV === 'development' ||
    new URLSearchParams(window.location.search).get('chipDebug') === '1';
  return touchDiagCached;
}

/** Dev build or `?whatDebug=1` — logs WHAT HIT + elementFromPoint on What taps. */
export function isWhatHitDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  if (whatHitDebugCached !== null) return whatHitDebugCached;
  whatHitDebugCached =
    process.env.NODE_ENV === 'development' ||
    new URLSearchParams(window.location.search).get('whatDebug') === '1' ||
    new URLSearchParams(window.location.search).get('chipDebug') === '1';
  return whatHitDebugCached;
}

export type WhatHitKind = 'back' | 'input' | 'chip' | 'slider';

export function logWhatHit(
  kind: WhatHitKind,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatHitDebugEnabled()) return;
  if (extra) {
    console.log(`WHAT HIT: ${kind}`, extra);
  } else {
    console.log(`WHAT HIT: ${kind}`);
  }
}

/** @deprecated use isWhatTouchDiagEnabled */
export const isPresetChipDiagEnabled = isWhatTouchDiagEnabled;

export type HitInspection = {
  tag: string;
  className: string;
  id: string;
  dataInstantBanView: string | null;
  closestPresetChip: boolean;
  closestBanInput: boolean;
  closestWhatBack: boolean;
  closestNoHorizontalPager: boolean;
  closestGestureExclude: boolean;
  pointerEvents: string;
  zIndex: string;
  position: string;
  transform: string;
};

export function inspectHitTarget(x: number, y: number): HitInspection | null {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  return {
    tag: el.tagName,
    className:
      typeof el.className === 'string' ? el.className : String(el.className),
    id: el.id,
    dataInstantBanView: el.getAttribute('data-instant-ban-view'),
    closestPresetChip: el.closest('[data-preset-chip]') != null,
    closestBanInput: el.closest('[data-ban-input]') != null,
    closestWhatBack: el.closest('[data-what-back]') != null,
    closestNoHorizontalPager: el.closest('[data-no-horizontal-pager]') != null,
    closestGestureExclude: el.closest('[data-gesture-exclude]') != null,
    pointerEvents: cs.pointerEvents,
    zIndex: cs.zIndex,
    position: cs.position,
    transform: cs.transform,
  };
}

export function describeHitTarget(x: number, y: number): string {
  const hit = inspectHitTarget(x, y);
  if (!hit) return 'null';
  const cls = hit.className.split(/\s+/).slice(0, 3).join('.');
  const flags = [
    hit.closestPresetChip ? '{chip}' : '',
    hit.closestBanInput ? '{input}' : '',
    hit.closestWhatBack ? '{back}' : '',
    hit.closestNoHorizontalPager ? '{no-pager}' : '',
  ].join('');
  return `${hit.tag}${hit.id ? `#${hit.id}` : ''}.${cls}${hit.dataInstantBanView ? `[${hit.dataInstantBanView}]` : ''}${flags}`;
}

export function logDocumentHitTest(
  phase: string,
  x: number,
  y: number,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  const hit = inspectHitTarget(x, y);
  console.log('[document-hit-test]', phase, { x, y, hit, ...extra });
}

export function logPresetChip(
  event: string,
  label: string,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  if (extra) {
    console.log(`[preset-chip] event=${event} label=${label}`, extra);
  } else {
    console.log(`[preset-chip] event=${event} label=${label}`);
  }
}

export function logBanInput(
  event: string,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  if (extra) {
    console.log(`[ban-input] event=${event}`, extra);
  } else {
    console.log(`[ban-input] event=${event}`);
  }
}

export function logWhatBack(
  event: string,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  if (extra) {
    console.log(`[what-back] event=${event}`, extra);
  } else {
    console.log(`[what-back] event=${event}`);
  }
}

export function logPager(
  event: 'capture' | 'start' | 'move' | 'end',
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  if (extra) {
    console.log(`[pager-${event}]`, extra);
  } else {
    console.log(`[pager-${event}]`);
  }
}

export function logComposeGesture(
  event: 'gesture' | 'touch',
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  const tag = event === 'gesture' ? '[compose-gesture]' : '[compose-touch]';
  if (extra) {
    console.log(`${tag} ${phase}`, extra);
  } else {
    console.log(`${tag} ${phase}`);
  }
}

export function logComposeLayer(
  layer: 'swipe-zone' | 'scroll-driver',
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!isWhatTouchDiagEnabled()) return;
  const tag = layer === 'swipe-zone' ? '[swipe-zone]' : '[scroll-driver]';
  if (extra) {
    console.log(`${tag} ${phase}`, extra);
  } else {
    console.log(`${tag} ${phase}`);
  }
}
