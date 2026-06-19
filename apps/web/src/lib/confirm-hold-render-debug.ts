'use client';

import { isOverlayInputLocked } from '@/lib/overlay-input-guard';

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
