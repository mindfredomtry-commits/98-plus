'use client';

let chipDiagCached: boolean | null = null;

/** Dev build or `?chipDebug=1` on the mini-app URL (works on phone). */
export function isPresetChipDiagEnabled(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  if (chipDiagCached !== null) return chipDiagCached;
  chipDiagCached =
    process.env.NODE_ENV === 'development' ||
    new URLSearchParams(window.location.search).get('chipDebug') === '1';
  return chipDiagCached;
}

export function logPresetChip(
  event: string,
  label: string,
  extra?: Record<string, unknown>,
): void {
  if (!isPresetChipDiagEnabled()) return;
  if (extra) {
    console.log(`[preset-chip] event=${event} label=${label}`, extra);
  } else {
    console.log(`[preset-chip] event=${event} label=${label}`);
  }
}

export function logPager(
  event: 'capture' | 'start' | 'move' | 'end',
  extra?: Record<string, unknown>,
): void {
  if (!isPresetChipDiagEnabled()) return;
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
  if (!isPresetChipDiagEnabled()) return;
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
  if (!isPresetChipDiagEnabled()) return;
  const tag = layer === 'swipe-zone' ? '[swipe-zone]' : '[scroll-driver]';
  if (extra) {
    console.log(`${tag} ${phase}`, extra);
  } else {
    console.log(`${tag} ${phase}`);
  }
}

export function describeHitTarget(x: number, y: number): string {
  if (typeof document === 'undefined') return 'no-document';
  const el = document.elementFromPoint(x, y);
  if (!el) return 'null';
  const id = el.id ? `#${el.id}` : '';
  const dataView = el.getAttribute('data-instant-ban-view');
  const preset = el.closest('[data-preset-chip]') ? 'preset-chip' : '';
  const cls =
    typeof el.className === 'string'
      ? el.className.split(/\s+/).slice(0, 3).join('.')
      : '';
  return `${el.tagName}${id}.${cls}${dataView ? `[${dataView}]` : ''}${preset ? '{chip}' : ''}`;
}
