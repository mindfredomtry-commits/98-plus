'use client';

export type BansLayerOpenIntent =
  | 'lobby-explicit'
  | 'result-cta-fallback'
  | 'unknown';

export type BansLayerPostResultAction = 'go-to-bans' | 'prohibit-again' | 'none';

export type BansLayerOpenGateSnapshot = {
  source: string;
  reason: string;
  intent: BansLayerOpenIntent;
  postResultAction: BansLayerPostResultAction;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  hasWhatFlow: boolean;
  hasConfirmFlow: boolean;
  hasSuccessFlow: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  goToBansAdvancePending: boolean;
  notificationChainHandoff: boolean;
  notificationChainAwaitingUser: boolean;
};

export type BansLayerOpenGateResult = BansLayerOpenGateSnapshot & {
  allowed: boolean;
  blocked: boolean;
  blockReason: string | null;
};

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { timestamp: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function resolveBansLayerOwnerDisplayKind(display: {
  directResultOverlayActive?: boolean;
  directResultOverlay?: boolean;
  result?: { id: string } | null;
  checkBan?: { id: string } | null;
  incomingBan?: { id: string } | null;
}): string | null {
  if (display.directResultOverlayActive || display.directResultOverlay) {
    return 'result-direct';
  }
  if (display.result?.id) return 'result';
  if (display.checkBan?.id) return 'check';
  if (display.incomingBan?.id) return 'incoming';
  return null;
}

export function resolveBansLayerPostResultAction(
  source: string,
  flags: {
    goToBansAdvancePending: boolean;
    goToBansClosingBanId: string | null;
  },
): BansLayerPostResultAction {
  if (
    flags.goToBansAdvancePending ||
    flags.goToBansClosingBanId != null ||
    source.includes('go-to-bans') ||
    source.includes('navigateFromResult') ||
    source.includes('finalizeResultForGoToBans') ||
    source.includes('status-cta') ||
    source.includes('overboard-status')
  ) {
    return 'go-to-bans';
  }
  if (
    source.includes('openNewBanWhoFlow') ||
    source.includes('new-ban-who') ||
    source.includes('prohibit-again') ||
    source.includes('beginNewBanWhoFlow')
  ) {
    return 'prohibit-again';
  }
  return 'none';
}

export function evaluateBansLayerOpenGate(
  snapshot: BansLayerOpenGateSnapshot,
): BansLayerOpenGateResult {
  if (snapshot.intent === 'lobby-explicit') {
    return {
      ...snapshot,
      allowed: true,
      blocked: false,
      blockReason: null,
    };
  }

  const blockers: string[] = [];
  if (snapshot.ownerQueueLen > 0) blockers.push('owner-queue-active');
  if (snapshot.ownerPendingLen > 0) blockers.push('owner-pending-active');
  if (snapshot.activeKind) blockers.push('owner-active-overlay');
  if (snapshot.displayKind) blockers.push('owner-display-overlay');
  if (snapshot.hasWhatFlow) blockers.push('what-flow-active');
  if (snapshot.hasConfirmFlow) blockers.push('confirm-flow-active');
  if (snapshot.hasSuccessFlow) blockers.push('success-flow-active');

  const chainOrOverlayActive =
    snapshot.ownerQueueLen > 0 ||
    snapshot.ownerPendingLen > 0 ||
    snapshot.activeKind != null ||
    snapshot.displayKind != null;

  if (snapshot.notificationChainTransitioning && chainOrOverlayActive) {
    blockers.push('chain-transitioning-with-overlay');
  }
  if (snapshot.chainAdvanceWaiting && chainOrOverlayActive) {
    blockers.push('chain-advance-waiting-with-overlay');
  }
  if (snapshot.goToBansAdvancePending && chainOrOverlayActive) {
    blockers.push('go-to-bans-advance-with-overlay');
  }
  if (snapshot.notificationChainHandoff && chainOrOverlayActive) {
    blockers.push('chain-handoff-with-overlay');
  }
  if (snapshot.notificationChainAwaitingUser && chainOrOverlayActive) {
    blockers.push('chain-awaiting-user-with-overlay');
  }

  const allowed = blockers.length === 0;
  return {
    ...snapshot,
    allowed,
    blocked: !allowed,
    blockReason: blockers.length > 0 ? blockers.join('|') : null,
  };
}

export function logBansLayerOpenBlockedDuringChain(
  data: {
    source: string;
    reason: string;
    ownerQueueLen: number;
    ownerPendingLen: number;
    activeKind: string | null;
    displayKind: string | null;
    hasWhatFlow: boolean;
    hasConfirmFlow: boolean;
    hasSuccessFlow: boolean;
    postResultAction: BansLayerPostResultAction;
    blocked: true;
    blockReason?: string | null;
    intent?: BansLayerOpenIntent;
  } & Record<string, unknown>,
): void {
  emit('BANS_LAYER_OPEN_BLOCKED_DURING_CHAIN', data);
}

export function logBansLayerOpenAllowed(
  data: {
    source: string;
    reason: string;
    intent: BansLayerOpenIntent;
    ownerQueueLen: number;
    ownerPendingLen: number;
    activeKind: string | null;
    displayKind: string | null;
  } & Record<string, unknown>,
): void {
  emit('BANS_LAYER_OPEN_ALLOWED', data);
}

export function logBansSectionAutoOpenRemovedPath(
  data: {
    source: string;
    oldFallback: 'bans-section';
    newFallback: 'lobby';
    queueLen: number;
    pendingLen: number;
    activeKind: string | null;
    displayKind: string | null;
  } & Record<string, unknown>,
): void {
  emit('BANS_SECTION_AUTO_OPEN_REMOVED_PATH', data);
}

export function logBansLayerFlagsClearedAfterChainOutcome(
  data: {
    source: string;
    outcome: string;
    wasBansCtaQueueSuppress: boolean;
    wasResultCtaBansOverlayOpen: boolean;
    nextOverlayKind: string | null;
    openedBansSection: boolean;
  } & Record<string, unknown>,
): void {
  emit('BANS_LAYER_FLAGS_CLEARED_AFTER_CHAIN_OUTCOME', data);
}
