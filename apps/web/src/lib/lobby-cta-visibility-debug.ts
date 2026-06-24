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

export function logLobbyCtaVisibilityState(input: {
  phase: string;
  sectionOpen: boolean;
  overlayOpen: boolean;
  ctaHiddenReason: string | null;
  ctaVisible: boolean;
}): void {
  emitDeduped('[LOBBY CTA VISIBILITY STATE]', input);
}

export function logLobbyCtaRestoreAfterSectionClose(input: {
  previousSection: string;
  nextPhase: string;
  ctaVisible: boolean;
}): void {
  emit('[LOBBY CTA RESTORE AFTER SECTION CLOSE]', input);
}

export function resolveLobbyCtaHiddenReason(input: {
  ctaState: string;
  showLobbyCta: boolean;
  effectiveBansOverlayOpen: boolean;
  notificationQueueUiLock: boolean;
  lobbyBootIntroPrimed: boolean;
}): string | null {
  if (input.showLobbyCta && !input.effectiveBansOverlayOpen) {
    return null;
  }
  if (!input.lobbyBootIntroPrimed) return 'boot-not-primed';
  if (input.effectiveBansOverlayOpen) return 'bans-section-open';
  if (input.notificationQueueUiLock) return 'notification-queue-ui-lock';
  if (input.ctaState === 'hidden') return 'ctaState-hidden';
  if (input.ctaState === 'exiting') return 'ctaState-exiting';
  return 'showLobbyCta-guard';
}
