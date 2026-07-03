'use client';

import { isOverlayInputLocked } from '@/lib/overlay-input-guard';
import { logConfirmOrbMissingDiagFromMountDecision } from '@/lib/confirm-orb-missing-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ConfirmHoldDebugSnapshot = {
  activeUserCardHold: string | null;
  activeUserCardHoldBanId: string | null;
  notificationChainAwaitingUser: boolean;
  overlayInputLocked: boolean;
  overlayInputLockSource: string | null;
};

export type ConfirmOrbQueueDebugSnapshot = {
  pendingLen: number;
  queueLen: number;
  overlayQueueHeadKind: string | null;
  selectedNextKind: string | null;
  selectedNextBanId: string | null;
  isPostSuccessHandoffInProgress: boolean;
  postSuccessHandoffTraceId: number;
  sendComposePhase: string;
  replyComposeActive: boolean;
  notificationChainTransitioning: boolean;
  notificationChainReplyComposeActive: boolean;
  chainReplyParentBanId: string | null;
  incomingBanId: string | null;
  heldUserCardKind: string | null;
  notificationChainHandoff: boolean;
  notificationChainAwaitingUser: boolean;
  chainAdvanceWaiting: boolean;
};

export type LobbyOrbMountInputs = {
  replyIncomingDeeplinkPending: boolean;
  checkDeeplinkDirectPending: boolean;
  replyLobbyBlocked: boolean;
  successToActiveLobbyBlocked: boolean;
  overlayHandoffLobbySuppressed: boolean;
  overlayHandoffBreakdown?: Record<string, boolean>;
  replyIncomingDeeplinkBreakdown?: Record<string, boolean>;
  replyLobbyBlockedBreakdown?: Record<string, boolean>;
  successExitDraining: boolean;
  postSuccessHandoffBlocking: boolean;
  postSuccessHandoffActive: boolean;
  notificationChainTransitioning: boolean;
  lobbyBootIntroPrimed: boolean;
};

export type LobbyOrbMountDecision = {
  lobbyOrbVisible: boolean;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  blockers: string[];
  primaryBlocker: string | null;
};

const QUEUE_HANDOFF_ORB_BLOCKERS = new Set([
  'postSuccessHandoffBlocking',
  'notificationChainTransitioning',
  'overlayHandoffLobbySuppressed',
  'successExitDraining',
  'replyIncomingDeeplinkPending',
]);

export function readOverlayInputLockFields(): {
  overlayInputLocked: boolean;
  overlayInputLockSource: string | null;
} {
  if (typeof window === 'undefined') {
    return { overlayInputLocked: false, overlayInputLockSource: null };
  }
  return {
    overlayInputLocked: isOverlayInputLocked(),
    overlayInputLockSource: window.__overlayInputLockSource ?? null,
  };
}

export function computeLobbyOrbMountDecision(
  input: LobbyOrbMountInputs,
): LobbyOrbMountDecision {
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

  const lobbyOrbVisible = blockers.length === 0;
  const showLobbyOrb = lobbyOrbVisible && input.lobbyBootIntroPrimed;
  const showBootOrb = lobbyOrbVisible && !input.lobbyBootIntroPrimed;

  return {
    lobbyOrbVisible,
    showLobbyOrb,
    showBootOrb,
    blockers,
    primaryBlocker: blockers[0] ?? null,
  };
}

export function computeLobbyOrbMountDecisionWithDiag(
  input: LobbyOrbMountInputs & { diagSource?: string | null },
): LobbyOrbMountDecision {
  const decision = computeLobbyOrbMountDecision(input);
  if (!decision.lobbyOrbVisible && input.diagSource) {
    logConfirmOrbMissingDiagFromMountDecision({
      source: `${input.diagSource}:computeLobbyOrbMountDecision`,
      lobbyOrbVisible: false,
      primaryBlocker: decision.primaryBlocker,
      blockers: decision.blockers,
    });
  }
  return decision;
}

export function isQueueHandoffOrbBlocker(blocker: string | null): boolean {
  return blocker != null && QUEUE_HANDOFF_ORB_BLOCKERS.has(blocker);
}

export function buildConfirmHoldNullReason(input: {
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  showOrbFace: boolean;
  hideOrbFaceTitle: boolean;
  suppressOrbFaceTitle: boolean;
  useLobbyRingDisplay: boolean;
  confirmActive: boolean;
  phase: string;
}): string {
  if (!input.showLobbyOrb && !input.showBootOrb) {
    return 'lobby-orb-not-mounted';
  }
  if (input.showBootOrb) {
    return 'boot-orb-active-hide-title';
  }
  if (!input.showOrbFace) {
    return 'orb-face-hidden';
  }
  if (input.hideOrbFaceTitle) {
    if (input.suppressOrbFaceTitle && input.useLobbyRingDisplay) {
      return 'title-suppressed:suppress-and-lobby-ring';
    }
    if (input.suppressOrbFaceTitle) {
      return 'title-suppressed:persistent-logo-visible';
    }
    if (input.useLobbyRingDisplay) {
      return 'title-suppressed:lobby-ring-display';
    }
    return 'title-suppressed:unknown';
  }
  if (!input.confirmActive) {
    return `confirm-inactive:phase-${input.phase}`;
  }
  return 'unknown';
}

export function logConfirmHoldRenderCheck(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM HOLD RENDER CHECK]', data);
}

export function logConfirmHoldReturnNull(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM HOLD RETURN NULL]', data);
}

export function logBeginComposingReplyState(
  data: Record<string, unknown>,
): void {
  emit('[BEGIN COMPOSING REPLY STATE]', data);
}

export function logIncomingReplyCleanupSnapshot(
  data: Record<string, unknown>,
): void {
  emit('[INCOMING REPLY CLEANUP SNAPSHOT]', data);
}

export function logConfirmOrbMountDecision(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM ORB MOUNT DECISION]', data);
}

export function logConfirmOrbBlockedByQueueState(
  data: Record<string, unknown>,
): void {
  emit('[CONFIRM ORB BLOCKED BY QUEUE STATE]', data);
}

export function logPostSuccessHandoffStillActiveDuringReply(
  data: Record<string, unknown>,
): void {
  emit('[POST SUCCESS HANDOFF STILL ACTIVE DURING REPLY]', data);
}

export function logLobbyIndicatorDuringConfirm(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY INDICATOR DURING CONFIRM]', data);
}

export function logNotificationDisplayBlockedDuringCompose(data: {
  source: string;
  activeKind?: string | null;
  queueLen: number;
  pendingLen: number;
  sendComposePhase: string;
  replyComposeActive: boolean;
  lobbyOpen: boolean;
}): void {
  emit('[NOTIFICATION DISPLAY BLOCKED DURING COMPOSE]', data);
}

export function logStaleComposeClearedBeforeBansNav(data: {
  source: string;
  sendComposePhaseBefore: string;
  replyComposePhaseBefore: boolean;
  activeKind: string | null;
  activeBanId: string | null;
  lobbyOpen: boolean;
  queueLen: number;
  pendingLen: number;
}): void {
  emit('[STALE COMPOSE CLEARED BEFORE BANS NAV]', data);
}

export function logQueueStateDuringConfirm(
  data: Record<string, unknown>,
): void {
  emit('[QUEUE STATE DURING CONFIRM]', data);
}
