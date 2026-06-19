'use client';

import { readLobbyCtaDebugSnapshot } from '@/lib/lobby-cta-snapshot-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type LobbyCtaGuardInputs = {
  lobbyBootIntroPrimed: boolean;
  replyIncomingDeeplinkPending: boolean;
  checkDeeplinkDirectPending: boolean;
  successToActiveLobbyBlocked: boolean;
  overlayHandoffLobbySuppressed: boolean;
  successExitDraining: boolean;
  postSuccessHandoffBlocking: boolean;
  notificationChainTransitioning: boolean;
  replyLobbyBlocked: boolean;
  bansReturnToLobbyLatch: boolean;
  deepLinkRouteBootPending: boolean;
  deepLinkReplyBooting: boolean;
  incomingReplyBanId: string | null;
  incomingGateActive: boolean;
  ctaState: string;
  effectiveBansOverlayOpen: boolean;
  notificationQueueUiLock: boolean;
};

export type LobbyCtaGuardDecision = {
  showLobbyCta: boolean;
  ctaShellVisible: boolean;
  blockers: string[];
  primaryBlocker: string | null;
  ctaStateBlocked: boolean;
};

export function computeLobbyCtaGuardDecision(
  input: LobbyCtaGuardInputs,
): LobbyCtaGuardDecision {
  const blockers: string[] = [];
  if (!input.lobbyBootIntroPrimed) blockers.push('lobbyBootIntroPrimed');
  if (input.replyIncomingDeeplinkPending) {
    blockers.push('replyIncomingDeeplinkPending');
  }
  if (input.checkDeeplinkDirectPending) {
    blockers.push('checkDeeplinkDirectPending');
  }
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
  if (input.replyLobbyBlocked && !input.bansReturnToLobbyLatch) {
    blockers.push('replyLobbyBlocked');
  }
  if (input.deepLinkRouteBootPending) blockers.push('deepLinkRouteBootPending');
  if (input.deepLinkReplyBooting) blockers.push('deepLinkReplyBooting');
  if (input.incomingReplyBanId) blockers.push('incomingReplyBanId');
  if (input.incomingGateActive && !input.bansReturnToLobbyLatch) {
    blockers.push('incomingGateActive');
  }

  const ctaStateBlocked = !(
    input.ctaState === 'visible' ||
    input.ctaState === 'exiting' ||
    input.ctaState === 'entering'
  );
  if (ctaStateBlocked) blockers.push(`ctaState:${input.ctaState}`);

  const showLobbyCta = blockers.length === 0;
  const jsxBlockers: string[] = [];
  if (input.effectiveBansOverlayOpen) jsxBlockers.push('effectiveBansOverlayOpen');
  if (input.notificationQueueUiLock) jsxBlockers.push('notificationQueueUiLock');

  const ctaShellVisible =
    showLobbyCta && jsxBlockers.length === 0;

  return {
    showLobbyCta,
    ctaShellVisible,
    blockers: [...blockers, ...jsxBlockers],
    primaryBlocker: blockers[0] ?? jsxBlockers[0] ?? null,
    ctaStateBlocked,
  };
}

export function buildLobbyCtaNullReason(
  decision: LobbyCtaGuardDecision,
): string {
  if (decision.ctaShellVisible) return 'unknown';
  if (decision.primaryBlocker) return decision.primaryBlocker;
  return 'unknown';
}

export function logLobbyCtaRenderCheck(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY CTA RENDER CHECK]', data);
}

export function logLobbyCtaReturnNull(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY CTA RETURN NULL]', data);
}

export function logChainEmptyFinalizeCheck(
  data: Record<string, unknown>,
): void {
  emit('[CHAIN EMPTY FINALIZE CHECK]', data);
}

export function logEmptyOverlayHostBlockedState(
  data: Record<string, unknown>,
): void {
  const ctaSnapshot = readLobbyCtaDebugSnapshot();
  emit('[EMPTY OVERLAY HOST BLOCKED]', {
    showLobbyChrome: ctaSnapshot?.showLobbyChrome ?? null,
    showTopNav: ctaSnapshot?.showTopNav ?? null,
    ctaVisible: ctaSnapshot?.ctaShellVisible ?? null,
    ctaState: ctaSnapshot?.ctaState ?? null,
    instantBanOpen: ctaSnapshot?.instantBanOpen ?? null,
    ...data,
  });
}
