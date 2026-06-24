'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ConfirmOrbMissingDiagPayload = {
  source: string;
  phase: string;
  sendComposePhase: string | null;
  confirmActive: boolean;
  lobbyOrbVisible: boolean;
  shouldRenderConfirmOrb: boolean;
  shouldRenderHoldOrb: boolean;
  confirmHoldReady: boolean;
  orbMountBlockedReason: string | null;
  notificationChainTransitioning: boolean;
  notificationChainAwaitingUser: boolean;
  pendingLen: number;
  queueLen: number;
  hasIncoming: boolean;
  activeKind: string | null;
  activeBanId: string | null;
  overlayVisible: boolean;
  notificationOverlayVisible: boolean;
  lobbyIndicatorVisible: boolean;
  /** Extra diagnostic fields (not in allowlist contract but useful). */
  mountDecisionLobbyOrbVisible?: boolean;
  mountDecisionPrimaryBlocker?: string | null;
  renderOrbBlockers?: string[];
  mountDecisionBlockers?: string[];
  queueClaimsNotificationScreen?: boolean;
  statusLabel?: string | null;
  showLobbyOrb?: boolean;
  showBootOrb?: boolean;
  lobbyBootIntroPrimed?: boolean;
  holdBlockReason?: string | null;
  title98Visible?: boolean;
};

export function logConfirmOrbMissingDiag(
  data: ConfirmOrbMissingDiagPayload,
): void {
  emit('[CONFIRM ORB MISSING DIAG]', data);
}

export function logConfirmOrbMissingDiagFromMountDecision(input: {
  source: string;
  lobbyOrbVisible: boolean;
  primaryBlocker: string | null;
  blockers: string[];
  phase?: string;
  confirmActive?: boolean;
}): void {
  if (input.lobbyOrbVisible) return;
  emit('[CONFIRM ORB MISSING DIAG]', {
    source: input.source,
    phase: input.phase ?? null,
    confirmActive: input.confirmActive ?? null,
    lobbyOrbVisible: false,
    shouldRenderConfirmOrb: false,
    shouldRenderHoldOrb: false,
    confirmHoldReady: false,
    orbMountBlockedReason: input.primaryBlocker,
    mountDecisionLobbyOrbVisible: false,
    mountDecisionPrimaryBlocker: input.primaryBlocker,
    mountDecisionBlockers: input.blockers,
    notificationChainTransitioning: null,
    notificationChainAwaitingUser: null,
    pendingLen: null,
    queueLen: null,
    hasIncoming: null,
    activeKind: null,
    activeBanId: null,
    overlayVisible: null,
    notificationOverlayVisible: null,
    lobbyIndicatorVisible: null,
  });
}

export function buildRenderLobbyOrbBlockers(input: {
  replyIncomingDeeplinkPending: boolean;
  checkDeeplinkDirectPending: boolean;
  replyLobbyBlocked: boolean;
  successToActiveLobbyBlocked: boolean;
  overlayHandoffLobbySuppressed: boolean;
  successExitDraining: boolean;
  postSuccessHandoffBlocking: boolean;
  notificationChainTransitioning: boolean;
  queueClaimsNotificationScreen: boolean;
  overlayQueueLength: number;
  queueLobbyGuardActive: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.replyIncomingDeeplinkPending) {
    blockers.push('replyIncomingDeeplinkPending');
  }
  if (input.checkDeeplinkDirectPending) {
    blockers.push('checkDeeplinkDirectPending');
  }
  if (input.replyLobbyBlocked) blockers.push('replyLobbyBlocked');
  if (input.successToActiveLobbyBlocked) {
    blockers.push('successToActiveLobbyBlocked');
  }
  if (input.overlayHandoffLobbySuppressed) {
    blockers.push('overlayHandoffLobbySuppressed');
  }
  if (input.successExitDraining) blockers.push('successExitDraining');
  if (input.postSuccessHandoffBlocking) {
    blockers.push('postSuccessHandoffBlocking');
  }
  if (input.notificationChainTransitioning) {
    blockers.push('notificationChainTransitioning');
  }
  if (input.queueClaimsNotificationScreen) {
    blockers.push('queueClaimsNotificationScreen');
    if (input.overlayQueueLength > 0) {
      blockers.push('overlayQueueLength>0');
    }
    if (input.queueLobbyGuardActive) {
      blockers.push('shouldBlockLobbyForActiveQueue');
    }
  }
  return blockers;
}

export function resolveOrbMountBlockedReason(input: {
  lobbyOrbVisible: boolean;
  showLobbyOrb: boolean;
  lobbyBootIntroPrimed: boolean;
  renderOrbBlockers: string[];
  mountPrimaryBlocker: string | null;
  holdBlockReason?: string | null;
}): string | null {
  if (!input.lobbyOrbVisible) {
    return input.renderOrbBlockers[0] ?? 'lobby-orb-hidden';
  }
  if (!input.lobbyBootIntroPrimed) return 'lobby-boot-not-primed';
  if (!input.showLobbyOrb) return 'show-lobby-orb-false';
  if (input.holdBlockReason) return input.holdBlockReason;
  return input.mountPrimaryBlocker;
}

export type ConfirmStripRenderDiagInput = {
  confirmActive: boolean;
  phase: string;
  sendComposePhase: string | null;
  statusLabel: string | null;
  showLobbyOrb: boolean;
  lobbyOrbVisible: boolean;
  queueClaimsNotificationScreen: boolean;
  overlayQueueLength: number;
  pendingLen: number;
  queueLen: number;
  hasIncoming: boolean;
  notificationChainTransitioning: boolean;
  notificationChainAwaitingUser: boolean;
  renderOrbBlockers: string[];
  orbMountBlockedReason: string | null;
};

let lastConfirmStripRenderDiagSig = '';

/** Render-path diagnostic: call from JSX when confirm strip is painted. */
export function traceConfirmStripRenderDiag(
  input: ConfirmStripRenderDiagInput,
): null {
  if (
    !input.confirmActive ||
    input.statusLabel !== 'Зажми' ||
    input.showLobbyOrb
  ) {
    return null;
  }
  const sig = JSON.stringify(input);
  if (sig === lastConfirmStripRenderDiagSig) return null;
  lastConfirmStripRenderDiagSig = sig;
  emit('[CONFIRM ORB MISSING DIAG]', {
    source: 'confirm-strip-render',
    ...input,
  });
  return null;
}
