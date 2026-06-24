'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

const EXPLICIT_NOTIFICATION_DRAIN_MARKERS = [
  'success-exit',
  'lobby-bans-cta',
  'lobby-bans',
  'explicit-bans',
  'status-cta',
  'go-to-bans',
  'overboard-status-direct',
  'navigateFromResult',
  'finalizeResultForGoToBans',
  'drainNextNotificationAfterSuccess',
  'active-timer-close',
  'stale-active-clear',
  'stale-active-clear-drain',
  'timer-go-to-bans',
  'user-answer',
  'check-dismiss',
  'dismiss:',
  'dismissBanResult',
  'armOpenBansOverlayFromResultCta',
  'releaseStartupInteractions',
  'primeNextNotificationAfterStatusCta',
  'openBansOverlay',
  'provider-openBansOverlayRequest',
  'manual flush from lobby button',
  'check-deeplink',
  'reply-deeplink',
  'openDeepLink',
  'applyCheckDeeplink',
  'applyIncoming',
  'bot-deeplink',
  'deeplink-direct',
  'stuck-boot-heal',
] as const;

export function isExplicitNotificationDrainSource(source: string): boolean {
  return EXPLICIT_NOTIFICATION_DRAIN_MARKERS.some((marker) =>
    source.includes(marker),
  );
}

/** Block showNext / continue / merge-to-overlay unless source is an explicit user/bot drain. */
export function shouldBlockNonExplicitNotificationDrain(
  source: string,
  startupHoldActive: boolean,
): boolean {
  if (isExplicitNotificationDrainSource(source)) return false;
  void startupHoldActive;
  return true;
}

export function logNonExplicitDrainBlocked(data: Record<string, unknown>): void {
  emit('[NON EXPLICIT DRAIN BLOCKED]', data);
}

export function logStartupAutoShowCardBug(data: Record<string, unknown>): void {
  emit('[STARTUP AUTO SHOW CARD BUG]', data);
}

export function logSyncDisplayBlockedStartupHold(
  data: Record<string, unknown>,
): void {
  emit('[SYNC DISPLAY BLOCKED STARTUP HOLD]', data);
}

export function logLobbyIndicatorOnlyNoCard(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY INDICATOR ONLY NO CARD]', data);
}

export type LobbyOpenQueuedNotificationsSnapshot = {
  chainTransitioning: boolean;
  hasMountedOverlay: boolean;
  startupHold: boolean;
  pendingLen: number;
  queueLen: number;
};

/** Pending-only on startup hold must not block lobby; mounted overlays and live queue still do. */
export function shouldBlockLobbyOpenForQueuedNotifications(
  snapshot: LobbyOpenQueuedNotificationsSnapshot,
): boolean {
  if (snapshot.chainTransitioning) return true;
  if (snapshot.hasMountedOverlay) return true;
  if (
    snapshot.startupHold &&
    snapshot.pendingLen > 0 &&
    snapshot.queueLen === 0
  ) {
    return false;
  }
  if (snapshot.queueLen > 0 || snapshot.pendingLen > 0) return true;
  return false;
}
