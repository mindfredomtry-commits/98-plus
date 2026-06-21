'use client';

import type { SyntheticEvent } from 'react';

const OVERLAY_INPUT_LOCK_MS = 350;

declare global {
  interface Window {
    __overlayInputLockedUntil?: number;
    __overlayInputLockSource?: string;
  }
}

/** Set carryover lock only after a user action was accepted — not on pointerdown. */
export function setOverlayInputLockAfterAction(source?: string): void {
  if (typeof window === 'undefined') return;
  const until = Date.now() + OVERLAY_INPUT_LOCK_MS;
  window.__overlayInputLockedUntil = until;
  window.__overlayInputLockSource = source ?? 'unknown';
  window.__debug98log?.('[OVERLAY INPUT LOCK SET AFTER ACTION]', { until, source });
}

/** @deprecated Use setOverlayInputLockAfterAction — lock belongs after action, not pointerdown. */
export function setOverlayInputLock(source?: string): void {
  setOverlayInputLockAfterAction(source);
}

export function clearOverlayInputLock(source?: string): void {
  if (typeof window === 'undefined') return;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[OVERLAY INPUT LOCK CLEARED]', { source });
}

/** Drop carryover from prior overlay cards when a check-card becomes interactive. */
export function clearCheckOverlayInputLock(banId?: string): void {
  if (typeof window === 'undefined') return;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[CHECK INPUT LOCK CLEARED]', { banId: banId ?? null });
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
  const lockSource = window.__overlayInputLockSource ?? '';
  // Check-card answers must not inherit the prior card's post-action lock.
  if (source === 'check-answer' && !lockSource.startsWith('check:')) {
    return false;
  }
  const now = Date.now();
  const until = window.__overlayInputLockedUntil ?? 0;
  window.__debug98log?.('[OVERLAY INPUT BLOCKED CARRYOVER]', {
    reason: 'input-lock-active',
    source,
    lockSource: window.__overlayInputLockSource ?? null,
    until,
    now,
    remainingMs: Math.max(0, until - now),
  });
  return true;
}

/** Returns false when tap should be ignored (carryover lock). Logs allow on success. */
export function allowOverlayUserTap(source: string): boolean {
  if (shouldBlockOverlayUserTap(source)) return false;
  window.__debug98log?.('[OVERLAY INPUT CURRENT ACTION ALLOWED]', { source });
  return true;
}

/** @deprecated Prefer allowOverlayUserTap in button handlers — capture guards block real clicks. */
export function overlayInputCaptureGuard(event: SyntheticEvent): void {
  if (!isOverlayInputLocked()) return;
  const now = Date.now();
  const until = window.__overlayInputLockedUntil ?? 0;
  window.__debug98log?.('[OVERLAY INPUT BLOCKED CARRYOVER]', {
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
