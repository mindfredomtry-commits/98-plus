'use client';

export type ResultTimerHitPathEntry = {
  tag: string;
  className: string;
  id: string;
  zIndex: string;
  pointerEvents: string;
  position: string;
  opacity: string;
};

const TIMER_BUTTON_RE =
  /BigButton|modal-card-actions|result-card-actions|instant-ban-active-ban-card/i;
const BLOCKER_HINT_RE =
  /app-notification-layer|hit-blocker|session-backdrop|modal-backdrop|notification-layer|check-direct|overlay-card-portal/i;

function readPathEntry(el: Element): ResultTimerHitPathEntry {
  const style = window.getComputedStyle(el);
  return {
    tag: el.tagName,
    className:
      el instanceof HTMLElement ? el.className.toString().slice(0, 240) : '',
    id: el instanceof HTMLElement ? el.id : '',
    zIndex: style.zIndex,
    pointerEvents: style.pointerEvents,
    position: style.position,
    opacity: style.opacity,
  };
}

function isTimerButtonHit(target: Element): boolean {
  if (target.tagName === 'BUTTON') return true;
  if (target.closest('button') != null) return true;
  if (target.closest('[data-pill-source="BigButton"]') != null) return true;
  const card = target.closest('.instant-ban-active-ban-card');
  if (!card) return false;
  return Boolean(card.querySelector('.modal-card-actions')?.contains(target));
}

export function probeResultTimerPointerHit(
  x: number,
  y: number,
  opts?: { banId?: string | null },
): void {
  if (typeof document === 'undefined') return;
  const target = document.elementFromPoint(x, y);
  if (!target) {
    window.__debug98log?.('[RESULT TIMER HIT BLOCKER FOUND]', {
      x,
      y,
      banId: opts?.banId ?? null,
      reason: 'elementFromPoint-null',
    });
    return;
  }

  window.__debug98log?.('[RESULT TIMER HIT TARGET]', {
    x,
    y,
    banId: opts?.banId ?? null,
    tag: target.tagName,
    className:
      target instanceof HTMLElement ? target.className.toString().slice(0, 240) : '',
    isButton: isTimerButtonHit(target),
  });

  const path: ResultTimerHitPathEntry[] = [];
  let node: Element | null = target;
  while (node && node !== document.documentElement) {
    path.push(readPathEntry(node));
    node = node.parentElement;
  }
  window.__debug98log?.('[RESULT TIMER HIT PATH]', {
    x,
    y,
    banId: opts?.banId ?? null,
    path,
  });

  if (!isTimerButtonHit(target)) {
    const style = window.getComputedStyle(target);
    const className =
      target instanceof HTMLElement ? target.className.toString() : '';
    window.__debug98log?.('[RESULT TIMER HIT BLOCKER FOUND]', {
      x,
      y,
      banId: opts?.banId ?? null,
      tag: target.tagName,
      className: className.slice(0, 240),
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      position: style.position,
      opacity: style.opacity,
      likelyBlocker:
        BLOCKER_HINT_RE.test(className) ||
        (style.pointerEvents !== 'none' &&
          !TIMER_BUTTON_RE.test(className) &&
          target.closest('.instant-ban-active-ban-card') == null),
      hasNotificationLayer: Boolean(
        document.querySelector('[data-notification-layer]'),
      ),
      hasReplyParentTimerAttr: Boolean(
        document.documentElement.dataset.replyParentActiveTimer,
      ),
      globalOverlayHostMounted: Boolean(
        document.querySelector('.app-notification-layer'),
      ),
    });
  }
}

export function installResultTimerHitTestProbe(opts: {
  banId: string | null;
  isTimerVisible: () => boolean;
}): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = (event: PointerEvent) => {
    if (!opts.isTimerVisible()) return;
    const card =
      document.querySelector('.instant-ban-active-ban-card') ??
      document.querySelector('[data-instant-ban-view="ActiveBanCardOverlay"]');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return;
    }
    probeResultTimerPointerHit(x, y, { banId: opts.banId });
  };

  document.addEventListener('pointerdown', handler, true);
  return () => document.removeEventListener('pointerdown', handler, true);
}
