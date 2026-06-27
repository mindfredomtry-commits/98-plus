'use client';

import { normalizeId } from '@/lib/normalize-json';
import {
  getDeeplinkSingleCardMode,
  isDeeplinkSingleCardModeActive,
} from '@/lib/deeplink-single-card-mode';
import {
  isDeepLinkRouteBootPending,
  readDeepLinkRouteBoot,
} from '@/lib/deep-link-route-boot';
import {
  clearKnownDirectBanId,
  noteKnownDirectBanId,
} from '@/lib/queue-api-fetch-debug';
import type { NotificationMode } from '@98plus/shared';
import type { LiveOverlayScreenContext } from '@/lib/live-overlay-screen';
import {
  isPlainLobbySurface,
  resolveLiveOverlayScreen,
} from '@/lib/live-overlay-screen';
import { getExplicitNotificationDrainSource } from '@/lib/notification-chain-explicit-drain';
import { mirrorOwnerDeeplinkMetaWrite } from '@/lib/notification-overlay-owner-deeplink-mirror';

export type FreshDeepLinkEntrySnapshot = {
  banId: string;
  launchSource: string;
  openedAt: number;
  consumed: boolean;
};

type FreshDeepLinkEntry = FreshDeepLinkEntrySnapshot;

let freshEntry: FreshDeepLinkEntry | null = null;

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

/** Read-only snapshot for owner shadow compare (Step 3). */
export function getFreshDeepLinkEntrySnapshot(): FreshDeepLinkEntrySnapshot | null {
  if (!freshEntry) return null;
  return { ...freshEntry };
}

export function armFreshDeepLinkEntry(
  banId: string,
  launchSource: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  freshEntry = {
    banId: normalized,
    launchSource,
    openedAt: performance.now(),
    consumed: false,
  };
  noteKnownDirectBanId(normalized);
  mirrorOwnerDeeplinkMetaWrite(`armFreshDeepLinkEntry:${launchSource}`);
  emit('[FRESH DEEPLINK ARMED]', {
    banId: normalized,
    launchSource,
    openedAt: freshEntry.openedAt,
  });
}

export function consumeFreshDeepLinkEntry(
  banId: string,
  reason: string,
): void {
  const normalized = normalizeId(banId);
  if (!freshEntry || freshEntry.consumed) return;
  if (normalized && normalized !== freshEntry.banId) return;
  freshEntry = { ...freshEntry, consumed: true };
  clearKnownDirectBanId();
  mirrorOwnerDeeplinkMetaWrite(`consumeFreshDeepLinkEntry:${reason}`);
  emit('[FRESH DEEPLINK CONSUMED]', {
    banId: freshEntry.banId,
    reason,
  });
}

export function getFreshDeepLinkEntryAgeMs(banId: string): number | null {
  if (!freshEntry || normalizeId(banId) !== freshEntry.banId) return null;
  return Math.round(performance.now() - freshEntry.openedAt);
}

export function getFreshDeepLinkLaunchSource(banId: string): string {
  if (!freshEntry || normalizeId(banId) !== freshEntry.banId) {
    return 'unknown';
  }
  return freshEntry.launchSource;
}

export function isFreshDeepLinkDisplayAllowed(
  banId: string,
  source: string,
  screenCtx?: LiveOverlayScreenContext,
): boolean {
  void source;
  const normalized = normalizeId(banId);
  if (!normalized || !freshEntry || freshEntry.consumed) return false;
  if (freshEntry.banId !== normalized) return false;

  const onPlainLobby = screenCtx ? isPlainLobbySurface(screenCtx) : false;

  if (onPlainLobby) {
    if (!isDeepLinkRouteBootPending()) return false;
    const boot = readDeepLinkRouteBoot();
    const pendingBanId = boot.pendingBanId
      ? normalizeId(boot.pendingBanId)
      : null;
    return !pendingBanId || pendingBanId === normalized;
  }

  if (isDeeplinkSingleCardModeActive()) {
    const cardMode = getDeeplinkSingleCardMode();
    if (cardMode && normalizeId(cardMode.banId) === normalized) {
      return true;
    }
  }

  if (isDeepLinkRouteBootPending()) {
    return true;
  }

  return true;
}

export function shouldBlockNormalModeLobbyOverlay(
  mode: NotificationMode,
  banId: string,
  source: string,
  screenCtx: LiveOverlayScreenContext,
): boolean {
  if (mode !== 'normal') return false;
  if (getExplicitNotificationDrainSource() != null) return false;
  if (!isPlainLobbySurface(screenCtx)) return false;
  if (isFreshDeepLinkDisplayAllowed(banId, source, screenCtx)) return false;
  return true;
}

export function logStaleDeeplinkBlockedAtSource(
  mode: NotificationMode,
  banId: string,
  source: string,
  screenCtx: LiveOverlayScreenContext,
  reason: string,
): void {
  const currentScreen = resolveLiveOverlayScreen(screenCtx);
  logStaleDeeplinkLiveBlocked({
    mode,
    banId,
    source,
    currentScreen,
    currentDeepLinkAgeMs: getFreshDeepLinkEntryAgeMs(banId),
    reason,
  });
  logDeeplinkDisplayBlockedAsLive({
    banId,
    mode,
    reason,
    source,
    currentScreen,
    isFreshLaunch: false,
  });
}

export function logFreshDeeplinkEntryAllowed(data: {
  mode: NotificationMode;
  banId: string;
  launchSource: string;
  openedAt: number;
  currentScreen: string;
  source: string;
}): void {
  emit('[FRESH DEEPLINK ENTRY ALLOWED]', data);
}

export function logStaleDeeplinkLiveBlocked(data: {
  mode: NotificationMode;
  banId: string;
  source: string;
  currentScreen: string;
  currentDeepLinkAgeMs: number | null;
  reason: string;
}): void {
  emit('[STALE DEEPLINK LIVE BLOCKED]', data);
}

export function logDeeplinkDisplayAllowed(data: {
  banId: string;
  mode: NotificationMode;
  reason: string;
  launchSource: string;
  isFreshLaunch: boolean;
  source: string;
}): void {
  emit('[DEEPLINK DISPLAY ALLOWED]', data);
}

export function logDeeplinkDisplayBlockedAsLive(data: {
  banId: string;
  mode: NotificationMode;
  reason: string;
  source: string;
  currentScreen: string;
  isFreshLaunch: boolean;
}): void {
  emit('[DEEPLINK DISPLAY BLOCKED_AS_LIVE]', data);
}
