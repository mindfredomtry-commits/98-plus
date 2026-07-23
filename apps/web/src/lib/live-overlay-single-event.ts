'use client';

/**
 * Vertical 6 TEMP — diag adapter only.
 * Live single-card ownership lives in notification-runtime direct entry
 * (entrySource='live-single', returnPolicy='lobby_after_card').
 */
import { normalizeId } from '@/lib/normalize-json';
import { shouldBlockNonExplicitNotificationDrain } from '@/lib/notification-chain-explicit-drain';

export type LiveOverlaySingleEventKind = 'incoming' | 'check' | 'result';

type LiveOverlaySingleEvent = {
  kind: LiveOverlaySingleEventKind;
  banId: string;
};

/** TEMP diag mirror — not production authority. */
let activeEvent: LiveOverlaySingleEvent | null = null;

/** Vertical 6: runtime direct-entry reader (registered by Providers). */
let runtimeDirectActiveReader: (() => boolean) | null = null;

export function registerRuntimeLiveDirectEntryActiveReader(
  reader: (() => boolean) | null,
): void {
  runtimeDirectActiveReader = reader;
}

/** TEMP diag arm — production path must call requestDirectEntry. */
export function beginLiveOverlaySingleEvent(
  kind: LiveOverlaySingleEventKind,
  banId: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  activeEvent = { kind, banId: normalized };
  window.__debug98log?.('[LIVE OVERLAY SINGLE EVENT BEGIN]', {
    kind,
    banId: normalized,
    note: 'v6-temp-diag',
  });
}

export function completeLiveOverlaySingleEvent(source: string): void {
  if (!activeEvent) return;
  window.__debug98log?.('[LIVE OVERLAY SINGLE EVENT COMPLETE]', {
    kind: activeEvent.kind,
    banId: activeEvent.banId,
    resultShown: true,
    continuedQueue: false,
    source,
    note: 'v6-temp-diag',
  });
  activeEvent = null;
}

export function isLiveOverlaySingleEventActive(): boolean {
  if (runtimeDirectActiveReader) {
    return runtimeDirectActiveReader();
  }
  return activeEvent != null;
}

export function getLiveOverlaySingleEvent(): LiveOverlaySingleEvent | null {
  return activeEvent;
}

export function isLiveOverlaySingleEventCompleting(
  overlayKind: 'incoming' | 'check' | 'result' | null,
  banId: string | null,
): boolean {
  if (!isLiveOverlaySingleEventActive() || !overlayKind || !banId) return false;
  if (activeEvent) {
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
  // Runtime-only active: any matching dismiss of current overlay completes.
  return true;
}

export function shouldBlockLiveOverlayChainContinuation(source: string): boolean {
  if (!isLiveOverlaySingleEventActive()) return false;
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
