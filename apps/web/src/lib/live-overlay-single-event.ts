'use client';

import { normalizeId } from '@/lib/normalize-json';
import { shouldBlockNonExplicitNotificationDrain } from '@/lib/notification-chain-explicit-drain';

export type LiveOverlaySingleEventKind = 'incoming' | 'check' | 'result';

type LiveOverlaySingleEvent = {
  kind: LiveOverlaySingleEventKind;
  banId: string;
};

let activeEvent: LiveOverlaySingleEvent | null = null;

export function beginLiveOverlaySingleEvent(
  kind: LiveOverlaySingleEventKind,
  banId: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  activeEvent = { kind, banId: normalized };
}

export function completeLiveOverlaySingleEvent(source: string): void {
  if (!activeEvent) return;
  window.__debug98log?.('[LIVE OVERLAY SINGLE EVENT COMPLETE]', {
    kind: activeEvent.kind,
    banId: activeEvent.banId,
    resultShown: true,
    continuedQueue: false,
    source,
  });
  activeEvent = null;
}

export function isLiveOverlaySingleEventActive(): boolean {
  return activeEvent != null;
}

export function getLiveOverlaySingleEvent(): LiveOverlaySingleEvent | null {
  return activeEvent;
}

export function isLiveOverlaySingleEventCompleting(
  overlayKind: 'incoming' | 'check' | 'result' | null,
  banId: string | null,
): boolean {
  if (!activeEvent || !overlayKind || !banId) return false;
  if (normalizeId(banId) !== activeEvent.banId) return false;
  if (overlayKind === activeEvent.kind) return true;
  if (
    (activeEvent.kind === 'incoming' || activeEvent.kind === 'check') &&
    overlayKind === 'result'
  ) {
    return true;
  }
  return false;
}

export function shouldBlockLiveOverlayChainContinuation(source: string): boolean {
  if (!activeEvent) return false;
  void source;
  return true;
}

/** Passive display gate — bypass when a real-time live single-event is active. */
export function shouldBlockPassiveNotificationDisplay(
  source: string,
  startupHoldActive: boolean,
): boolean {
  if (isLiveOverlaySingleEventActive()) return false;
  return shouldBlockNonExplicitNotificationDrain(source, startupHoldActive);
}
