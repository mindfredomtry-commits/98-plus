'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

const sigByEvent = new Map<string, string>();

function emitDeduped(event: string, data: Record<string, unknown>): void {
  const sig = JSON.stringify(data);
  if (sigByEvent.get(event) === sig) return;
  sigByEvent.set(event, sig);
  emit(event, data);
}

const QUEUE_COMPOSE_NOTIFICATION_BLOCKERS = new Set([
  'queueClaimsNotificationScreen',
  'overlayQueueLength>0',
  'shouldBlockLobbyForActiveQueue',
  'notificationChainTransitioning',
  'postSuccessHandoffBlocking',
  'replyLobbyBlocked',
  'replyIncomingDeeplinkPending',
  'overlayHandoffLobbySuppressed',
  'successExitDraining',
  'successToActiveLobbyBlocked',
  'checkDeeplinkDirectPending',
]);

export function resolveBaseLobbyReasonIfHidden(input: {
  orbMounted: boolean;
  lobbyMounted: boolean;
  lobbyBootIntroPrimed: boolean;
  legacyBlockers: string[];
}): string | null {
  if (input.orbMounted) {
    return null;
  }
  if (!input.lobbyBootIntroPrimed) {
    return 'boot-not-primed';
  }
  for (const blocker of input.legacyBlockers) {
    if (QUEUE_COMPOSE_NOTIFICATION_BLOCKERS.has(blocker)) {
      return `bug-legacy-${blocker}`;
    }
  }
  return 'orb-unmounted-after-boot';
}

export function logBaseLobbyLayerState(input: {
  phase: string;
  hasOverlay: boolean;
  overlayKind: string | null;
  composePhase: string | null;
  lobbyMounted: boolean;
  orbMounted: boolean;
  reasonIfHidden: string | null;
}): void {
  emitDeduped('[BASE LOBBY LAYER STATE]', input);
}
