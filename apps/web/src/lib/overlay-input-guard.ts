'use client';

import type { SyntheticEvent } from 'react';

const OVERLAY_INPUT_LOCK_MS = 350;

declare global {
  interface Window {
    __overlayInputLockedUntil?: number;
  }
}

export function setOverlayInputLock(source?: string): void {
  if (typeof window === 'undefined') return;
  const until = Date.now() + OVERLAY_INPUT_LOCK_MS;
  window.__overlayInputLockedUntil = until;
  window.__debug98log?.('[OVERLAY INPUT LOCK SET]', { until, source });
}

export function isOverlayInputLocked(): boolean {
  if (typeof window === 'undefined') return false;
  const until = window.__overlayInputLockedUntil ?? 0;
  if (until === 0) return false;
  const now = Date.now();
  if (now < until) return true;
  window.__overlayInputLockedUntil = 0;
  window.__debug98log?.('[OVERLAY INPUT LOCK EXPIRED]', { until, now });
  return false;
}

export function overlayInputCaptureGuard(event: SyntheticEvent): void {
  if (!isOverlayInputLocked()) return;
  window.__debug98log?.('[OVERLAY INPUT BLOCKED]', {
    type: event.type,
    until: window.__overlayInputLockedUntil ?? 0,
  });
  event.preventDefault();
  event.stopPropagation();
}
