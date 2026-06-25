'use client';

import { normalizeId } from '@/lib/normalize-json';
import { armFreshDeepLinkEntry, consumeFreshDeepLinkEntry } from '@/lib/fresh-deeplink-entry';
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

let mode: DeeplinkSingleCardMode | null = null;

export function isNotificationQueueDrainSource(source: string): boolean {
  return NOTIFICATION_QUEUE_DRAIN_SOURCES.some((marker) =>
    source.includes(marker),
  );
}

export function enableDeeplinkSingleCardMode(
  kind: DeeplinkSingleCardKind,
  banId: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  mode = { kind, banId: normalized };
  armFreshDeepLinkEntry(normalized, `single-card:${kind}`);
  window.__debug98log?.('[DEEPLINK SINGLE CARD MODE ON]', {
    kind,
    banId: normalized,
  });
}

export function completeDeeplinkSingleCardMode(source: string): void {
  if (!mode) return;
  consumeFreshDeepLinkEntry(mode.banId, `deeplink-single-card:${source}`);
  window.__debug98log?.('[DEEPLINK SINGLE CARD COMPLETE]', {
    kind: mode.kind,
    banId: mode.banId,
    source,
  });
  mode = null;
}

export function getDeeplinkSingleCardMode(): DeeplinkSingleCardMode | null {
  return mode;
}

export function isDeeplinkSingleCardModeActive(): boolean {
  return mode != null;
}

/** @deprecated Use isNotificationQueueDrainSource; kept for call-site compatibility. */
export function allowDeeplinkExplicitNotificationDrain(source: string): void {
  if (!isNotificationQueueDrainSource(source)) return;
  window.__debug98log?.('[DEEPLINK EXPLICIT DRAIN ALLOWED]', { source });
}

/**
 * While a Telegram deep-link single-card route is active, block queue drain unless
 * the source is an explicit post-success or lobby-bans queue start.
 */
export function shouldBlockDeeplinkAutoDrain(source: string): boolean {
  if (!mode) return false;
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
  if (!mode || !banId) return false;
  if (normalizeId(banId) !== mode.banId) return false;
  if (mode.kind === 'check' && overlayKind === 'check') return true;
  if (mode.kind === 'reply' && overlayKind === 'incoming') return true;
  if (mode.kind === 'incoming' && overlayKind === 'incoming') return true;
  if (mode.kind === 'result' && overlayKind === 'result') return true;
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
