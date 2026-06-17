'use client';

export type OverlayHitTestPathEntry = {
  tag: string;
  className: string;
  id: string;
  zIndex: string;
  pointerEvents: string;
  position: string;
  opacity: string;
  filter: string;
  backdropFilter: string;
};

const BLOCKER_HINT_RE =
  /backdrop|notification-layer|check-direct|modal-backdrop|hit-blocker|session-backdrop/i;

function readHitPathEntry(el: Element): OverlayHitTestPathEntry {
  const style = window.getComputedStyle(el);
  return {
    tag: el.tagName,
    className:
      el instanceof HTMLElement ? el.className.toString().slice(0, 200) : '',
    id: el instanceof HTMLElement ? el.id : '',
    zIndex: style.zIndex,
    pointerEvents: style.pointerEvents,
    position: style.position,
    opacity: style.opacity,
    filter: style.filter,
    backdropFilter: style.backdropFilter,
  };
}

export function probeOverlayPointerHit(
  x: number,
  y: number,
  opts?: { banId?: string | null; kind?: string },
): void {
  if (typeof document === 'undefined') return;
  const target = document.elementFromPoint(x, y);
  if (!target) {
    window.__debug98log?.('[OVERLAY HIT BLOCKER FOUND]', {
      x,
      y,
      reason: 'elementFromPoint-null',
      banId: opts?.banId ?? null,
      kind: opts?.kind ?? null,
    });
    return;
  }

  window.__debug98log?.('[OVERLAY HIT TEST TARGET]', {
    x,
    y,
    tag: target.tagName,
    className:
      target instanceof HTMLElement ? target.className.toString().slice(0, 200) : '',
    banId: opts?.banId ?? null,
    kind: opts?.kind ?? null,
  });

  const path: OverlayHitTestPathEntry[] = [];
  let node: Element | null = target;
  while (node && node !== document.documentElement) {
    path.push(readHitPathEntry(node));
    node = node.parentElement;
  }
  window.__debug98log?.('[OVERLAY HIT TEST PATH]', {
    x,
    y,
    banId: opts?.banId ?? null,
    kind: opts?.kind ?? null,
    path,
  });

  const buttonHit =
    target.tagName === 'BUTTON' ||
    target.closest('button') != null ||
    target.closest('[data-pill-source="BigButton"]') != null;

  if (!buttonHit) {
    const style = window.getComputedStyle(target);
    window.__debug98log?.('[OVERLAY HIT BLOCKER FOUND]', {
      x,
      y,
      banId: opts?.banId ?? null,
      kind: opts?.kind ?? null,
      tag: target.tagName,
      className:
        target instanceof HTMLElement ? target.className.toString().slice(0, 200) : '',
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      position: style.position,
      opacity: style.opacity,
      filter: style.filter,
      backdropFilter: style.backdropFilter,
      likelyBlocker: BLOCKER_HINT_RE.test(
        target instanceof HTMLElement ? target.className.toString() : '',
      ),
    });
  }
}

export function installOverlayHitTestProbe(opts: {
  banId: string | null;
  kind: string;
  isCardVisible: () => boolean;
}): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = (event: PointerEvent) => {
    if (!opts.isCardVisible()) return;
    const card =
      document.querySelector('.modal-card--incoming[data-overlay-user-card]') ??
      document.querySelector('.incoming-modal-body[data-overlay-user-card]') ??
      document.querySelector('.modal-card--incoming') ??
      document.querySelector('[data-overlay-user-card]');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return;
    }
    probeOverlayPointerHit(x, y, { banId: opts.banId, kind: opts.kind });
  };

  document.addEventListener('pointerdown', handler, true);
  return () => document.removeEventListener('pointerdown', handler, true);
}
