'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ExplicitNotificationDrainSource =
  | 'lobby_tvoi_zaprety'
  | 'post_success'
  | 'post_timer';

let explicitDrainSource: ExplicitNotificationDrainSource | null = null;

export function beginExplicitNotificationDrain(
  source: ExplicitNotificationDrainSource,
  pendingCount?: number,
): void {
  explicitDrainSource = source;
  emit('[QUEUE EXPLICIT DRAIN START]', { source, pendingCount: pendingCount ?? null });
}

export function clearExplicitNotificationDrain(reason?: string): void {
  explicitDrainSource = null;
  if (reason) {
    emit('[QUEUE EXPLICIT DRAIN CLEARED]', { reason });
  }
}

export type ExplicitDrainClearSnapshot = {
  pendingCount: number;
  queueHeadKind: string | null;
  queueHeadId: string | null;
  activeKind: string | null;
  activeOverlayId: string | null;
  hasScheduledNext: boolean;
};

export function tryClearExplicitNotificationDrain(
  source: string,
  reason: string,
  snapshot: ExplicitDrainClearSnapshot,
): boolean {
  if (explicitDrainSource == null) {
    return false;
  }
  if (snapshot.pendingCount > 0) {
    emit('[QUEUE EXPLICIT DRAIN CLEAR SKIPPED]', {
      reason: 'pending-remaining',
      source,
      pendingCount: snapshot.pendingCount,
      queueHead: snapshot.queueHeadId,
      activeKind: snapshot.activeKind,
      hasScheduledNext: snapshot.hasScheduledNext,
    });
    return false;
  }
  if (snapshot.queueHeadId) {
    emit('[QUEUE EXPLICIT DRAIN CLEAR SKIPPED]', {
      reason: 'queue-head-present',
      source,
      pendingCount: snapshot.pendingCount,
      queueHead: snapshot.queueHeadId,
      activeKind: snapshot.activeKind,
      hasScheduledNext: snapshot.hasScheduledNext,
    });
    return false;
  }
  if (snapshot.activeOverlayId) {
    emit('[QUEUE EXPLICIT DRAIN CLEAR SKIPPED]', {
      reason: 'active-overlay-present',
      source,
      pendingCount: snapshot.pendingCount,
      queueHead: snapshot.queueHeadId,
      activeKind: snapshot.activeKind,
      hasScheduledNext: snapshot.hasScheduledNext,
    });
    return false;
  }
  if (snapshot.hasScheduledNext) {
    emit('[QUEUE EXPLICIT DRAIN CLEAR SKIPPED]', {
      reason: 'scheduled-next',
      source,
      pendingCount: snapshot.pendingCount,
      queueHead: snapshot.queueHeadId,
      activeKind: snapshot.activeKind,
      hasScheduledNext: snapshot.hasScheduledNext,
    });
    return false;
  }
  clearExplicitNotificationDrain(reason);
  return true;
}

export function getExplicitNotificationDrainSource(): ExplicitNotificationDrainSource | null {
  return explicitDrainSource;
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

/** Block overlay display unless an explicit user flow started the queue drain. */
export function shouldBlockNonExplicitNotificationDrain(
  source: string,
  startupHoldActive: boolean,
): boolean {
  void startupHoldActive;
  if (isExplicitNotificationDrainSource(source)) return false;
  return explicitDrainSource == null;
}

export function logQueueAutoStartBlocked(data: {
  reason: string;
  currentScreen?: string | null;
  explicitDrainSource?: ExplicitNotificationDrainSource | null;
  pendingCount?: number;
}): void {
  emit('[QUEUE AUTO START BLOCKED]', {
    explicitDrainSource,
    ...data,
  });
}

export function logQueueDisplayDenied(data: {
  reason: string;
  currentScreen?: string | null;
  explicitDrainSource?: ExplicitNotificationDrainSource | null;
}): void {
  emit('[QUEUE DISPLAY DENIED]', {
    explicitDrainSource,
    ...data,
  });
}

export function logQueueDisplayAllowed(data: {
  source: string;
  headKind: string | null;
  headBanId: string | null;
}): void {
  emit('[QUEUE DISPLAY ALLOWED]', {
    explicitDrainSource,
    ...data,
  });
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
