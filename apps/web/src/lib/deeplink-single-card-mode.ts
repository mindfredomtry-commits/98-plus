'use client';

/**
 * Vertical 6 TEMP — presentation/diag adapter only.
 * Production direct-entry authority is notification-runtime (selectIsDirectEntry).
 */
import { normalizeId } from '@/lib/normalize-json';
import { armFreshDeepLinkEntry, consumeFreshDeepLinkEntry } from '@/lib/fresh-deeplink-entry';
import { mirrorOwnerDeeplinkMetaWrite } from '@/lib/notification-overlay-owner-deeplink-mirror';
import {
  shouldBlockNonExplicitNotificationDrain,
} from '@/lib/notification-chain-explicit-drain';

export {
  isExplicitNotificationDrainSource,
  shouldBlockNonExplicitNotificationDrain,
} from '@/lib/notification-chain-explicit-drain';

export type DeeplinkSingleCardKind = 'check' | 'reply' | 'incoming' | 'result';

type DeeplinkSingleCardMode = {
  kind: DeeplinkSingleCardKind;
  banId: string;
};

/** Only these sources may drain the notification queue while single-card mode is active. */
const NOTIFICATION_QUEUE_DRAIN_SOURCES = [
  'success-exit',
  'success-exit-retry',
  'success-exit-retry-flush',
  'lobby-bans',
  'lobby-bans-cta',
  'open-bans',
  'user-bans-button',
  'explicit-bans',
  'armOpenBansOverlayFromResultCta',
  'go-to-bans',
  'navigateFromResult',
  'finalizeResultForGoToBans',
  'status-cta',
  'overboard-status-direct',
  'primeNextNotificationAfterStatusCta',
  'openBansOverlay',
  'provider-openBansOverlayRequest',
  'manual flush from lobby button',
  'drainNextNotificationAfterSuccess',
  'releaseStartupInteractions',
  'active-timer-close',
] as const;

/** TEMP diag mirror — not production authority. */
let mode: DeeplinkSingleCardMode | null = null;

/** Vertical 6: runtime direct-entry reader (registered by Providers). */
let runtimeDirectActiveReader: (() => boolean) | null = null;

export function registerRuntimeDirectEntryActiveReader(
  reader: (() => boolean) | null,
): void {
  runtimeDirectActiveReader = reader;
}

export function isNotificationQueueDrainSource(source: string): boolean {
  return NOTIFICATION_QUEUE_DRAIN_SOURCES.some((marker) =>
    source.includes(marker),
  );
}

/** TEMP: diag arm only — does not own queue/lifecycle. */
export function enableDeeplinkSingleCardMode(
  kind: DeeplinkSingleCardKind,
  banId: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  mode = { kind, banId: normalized };
  armFreshDeepLinkEntry(normalized, `single-card:${kind}`);
  mirrorOwnerDeeplinkMetaWrite(`enableDeeplinkSingleCardMode:${kind}`);
  window.__debug98log?.('[DEEPLINK SINGLE CARD MODE ON]', {
    kind,
    banId: normalized,
    note: 'v6-temp-diag',
  });
}

/** TEMP: diag clear only. */
export function completeDeeplinkSingleCardMode(source: string): void {
  if (!mode) return;
  consumeFreshDeepLinkEntry(mode.banId, `deeplink-single-card:${source}`);
  window.__debug98log?.('[DEEPLINK SINGLE CARD COMPLETE]', {
    kind: mode.kind,
    banId: mode.banId,
    source,
    note: 'v6-temp-diag',
  });
  mode = null;
  mirrorOwnerDeeplinkMetaWrite(`completeDeeplinkSingleCardMode:${source}`);
}

export function getDeeplinkSingleCardMode(): DeeplinkSingleCardMode | null {
  return mode;
}

/** Production: runtime direct entry when reader registered. */
export function isDeeplinkSingleCardModeActive(): boolean {
  if (runtimeDirectActiveReader) {
    return runtimeDirectActiveReader();
  }
  return mode != null;
}

/** @deprecated Use isNotificationQueueDrainSource; kept for call-site compatibility. */
export function allowDeeplinkExplicitNotificationDrain(source: string): void {
  if (!isNotificationQueueDrainSource(source)) return;
  window.__debug98log?.('[DEEPLINK EXPLICIT DRAIN ALLOWED]', { source });
}

/**
 * Block auto-drain while runtime direct session is active (lobby_after_card).
 */
export function shouldBlockDeeplinkAutoDrain(source: string): boolean {
  if (!isDeeplinkSingleCardModeActive()) return false;
  if (isNotificationQueueDrainSource(source)) return false;
  return true;
}

export function shouldBlockSingleCardChainContinuation(source: string): boolean {
  return shouldBlockDeeplinkAutoDrain(source);
}

export function isDeeplinkSingleCardCompleting(
  overlayKind: 'incoming' | 'check' | 'result' | null,
  banId: string | null,
): boolean {
  if (!isDeeplinkSingleCardModeActive() || !banId) return false;
  const cardMode = mode;
  if (cardMode && normalizeId(banId) !== cardMode.banId) {
    // Runtime-active without TEMP mode: treat matching overlay as completing.
    return runtimeDirectActiveReader != null;
  }
  if (!cardMode) return runtimeDirectActiveReader != null;
  if (normalizeId(banId) !== cardMode.banId) return false;
  if (cardMode.kind === 'check' && overlayKind === 'check') return true;
  if (cardMode.kind === 'reply' && overlayKind === 'incoming') return true;
  if (cardMode.kind === 'incoming' && overlayKind === 'incoming') return true;
  if (cardMode.kind === 'result' && overlayKind === 'result') return true;
  return false;
}

export function logDeeplinkAutoDrainBlocked(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK AUTO DRAIN BLOCKED]', data);
}

export function logDeeplinkSingleCardChainBlocked(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[DEEPLINK SINGLE CARD CHAIN BLOCKED]', data);
}

export function logDeeplinkReturnLobby(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK RETURN LOBBY]', data);
}

export function logDeeplinkAutoDrainBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK AUTO DRAIN BUG]', data);
}

export function logSyncDisplayBlockedSingleCard(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[SYNC DISPLAY BLOCKED SINGLE CARD]', data);
}
