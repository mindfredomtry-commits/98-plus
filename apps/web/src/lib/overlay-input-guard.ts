'use client';

import type { SyntheticEvent } from 'react';

/**
 * Stage 6B Phase 2 — timer carryover lock is retired for card-action gating.
 *
 * Historical bug: markOverlayUserAction set a ~350ms window lock; the next
 * card's first tap hit allowOverlayUserTap and was rejected until the timer
 * expired (forced second tap). Action single-flight now belongs to
 * NotificationRuntime (selectIsActionBlocked) or sync identity latches.
 *
 * These helpers remain as no-op / always-allow compatibility surfaces so
 * residual call sites cannot reintroduce timer gating.
 */

declare global {
  interface Window {
    __overlayInputLockedUntil?: number;
    __overlayInputLockSource?: string;
  }
}

/** Compatibility no-op — does not create a wall-clock action lock. */
export function setOverlayInputLockAfterAction(source?: string): void {
  if (typeof window === 'undefined') return;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[OVERLAY INPUT LOCK RETIRED]', {
    source: source ?? 'unknown',
    phase: 'stage6b-phase2',
  });
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

/** Drop residual carryover state when a check-card becomes interactive. */
export function clearCheckOverlayInputLock(banId?: string): void {
  if (typeof window === 'undefined') return;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  window.__debug98log?.('[CHECK INPUT LOCK CLEARED]', { banId: banId ?? null });
}

/** Always false — timer lock no longer blocks taps. */
export function isOverlayInputLocked(): boolean {
  if (typeof window === 'undefined') return false;
  window.__overlayInputLockedUntil = 0;
  window.__overlayInputLockSource = undefined;
  return false;
}

/** Always false — carryover timer gating is retired. */
export function shouldBlockOverlayUserTap(_source: string): boolean {
  return false;
}

/**
 * Always allows. Card actions must gate on runtime pending/succeeded or a
 * sync local in-flight latch — never on this helper.
 */
export function allowOverlayUserTap(source: string): boolean {
  if (typeof window !== 'undefined') {
    window.__debug98log?.('[OVERLAY INPUT CURRENT ACTION ALLOWED]', {
      source,
      phase: 'stage6b-phase2-no-timer-gate',
    });
  }
  return true;
}

/** @deprecated Prefer allowOverlayUserTap in button handlers — capture guards block real clicks. */
export function overlayInputCaptureGuard(event: SyntheticEvent): void {
  if (!isOverlayInputLocked()) return;
  event.preventDefault();
  event.stopPropagation();
}
