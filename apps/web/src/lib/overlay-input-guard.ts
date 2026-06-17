'use client';

import type { SyntheticEvent } from 'react';

const OVERLAY_INPUT_LOCK_MS = 350;

declare global {
  interface Window {
    __overlayInputLockedUntil?: number;
    __overlayInputLockSource?: string;
  }
}

export function setOverlayInputLock(source?: string): void {
  if (typeof window === 'undefined') return;
  const until = Date.now() + OVERLAY_INPUT_LOCK_MS;
  window.__overlayInputLockedUntil = until;
  window.__overlayInputLockSource = source ?? 'unknown';
  window.__debug98log?.('[OVERLAY INPUT LOCK SET]', { until, source });
}

export function clearOverlayInputLock(source?: string): void {
  if (typeof window === 'undefined') return;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[OVERLAY INPUT LOCK CLEARED]', { source });
}

export function isOverlayInputLocked(): boolean {
  if (typeof window === 'undefined') return false;
  const until = window.__overlayInputLockedUntil ?? 0;
  if (until === 0) return false;
  const now = Date.now();
  if (now < until) return true;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[OVERLAY INPUT LOCK EXPIRED]', { until, now });
  return false;
}

/** Block stale carryover taps during the short post-action lock window. */
export function shouldBlockOverlayUserTap(source: string): boolean {
  if (!isOverlayInputLocked()) return false;
  const now = Date.now();
  const until = window.__overlayInputLockedUntil ?? 0;
  window.__debug98log?.('[OVERLAY INPUT BLOCKED]', {
    reason: 'input-lock-active',
    source,
    lockSource: window.__overlayInputLockSource ?? null,
    until,
    now,
    remainingMs: Math.max(0, until - now),
  });
  return true;
}

/** @deprecated Prefer shouldBlockOverlayUserTap in button handlers — capture guards block real clicks. */
export function overlayInputCaptureGuard(event: SyntheticEvent): void {
  if (!isOverlayInputLocked()) return;
  const now = Date.now();
  const until = window.__overlayInputLockedUntil ?? 0;
  window.__debug98log?.('[OVERLAY INPUT BLOCKED]', {
    type: event.type,
    reason: 'capture-guard',
    lockSource: window.__overlayInputLockSource ?? null,
    until,
    now,
    remainingMs: Math.max(0, until - now),
  });
  event.preventDefault();
  event.stopPropagation();
}
