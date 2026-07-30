/**
 * Stage 6B Phase 3 — overlay lifecycle + lobby CTA restoration.
 *
 * Pure decisions only. Prefer runtime idle+empty + presentation-release
 * invariants over local ctaState timers / host shadow latches.
 */

import { isRuntimeIdleEmptyAfterOverboard } from '@/notification-runtime/notification-runtime.overboard-completion';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';
import {
  isPostNotificationPresentationFullyReleased,
  type PostNotificationPresentationSnapshot,
} from '@/lib/post-notification-presentation-release';
import { selectOverlayVisible } from '@/notification-runtime/notification-runtime.selectors';

/** Alias — idle+empty is not overboard-specific. */
export const isRuntimeIdleEmpty = isRuntimeIdleEmptyAfterOverboard;

export type LobbyCtaEligibilityInput = {
  lobbyBootIntroPrimed: boolean;
  phaseIdle: boolean;
  interactiveLobbyChromeMayShow: boolean;
  presentationFullyReleased: boolean;
  /** Compose / deeplink / SUCCESS-exit host blockers (any true → hide). */
  hostBlocksCta: boolean;
  /**
   * Local spring machine. Must NOT hide CTA when runtime+presentation already
   * allow it — that is the Phase 0 stale-ctaState failure mode.
   */
  ctaState: 'hidden' | 'entering' | 'visible' | 'exiting';
};

export type LobbyCtaEligibilityDecision = {
  /** Product paint gate for «запрещать». */
  show: boolean;
  /** Sync local machine to visible (no enter timer). */
  forceCtaVisible: boolean;
  reason: string | null;
};

/**
 * CTA visibility from runtime chrome + presentation release.
 * Stale ctaState=hidden cannot override when eligibility is true.
 */
export function decideLobbyCtaEligibility(
  input: LobbyCtaEligibilityInput,
): LobbyCtaEligibilityDecision {
  if (!input.lobbyBootIntroPrimed) {
    return { show: false, forceCtaVisible: false, reason: 'boot-not-primed' };
  }
  if (!input.phaseIdle) {
    return { show: false, forceCtaVisible: false, reason: 'phase-not-idle' };
  }
  if (input.hostBlocksCta) {
    return { show: false, forceCtaVisible: false, reason: 'host-blocks-cta' };
  }
  if (!input.interactiveLobbyChromeMayShow) {
    return {
      show: false,
      forceCtaVisible: false,
      reason: 'chrome-not-allowed',
    };
  }
  if (!input.presentationFullyReleased) {
    // Mid-chain / SUCCESS hold / host result still painted — never lobby CTA.
    return {
      show: false,
      forceCtaVisible: false,
      reason: 'presentation-not-released',
    };
  }
  // Runtime + presentation allow chrome: paint CTA even if local machine stuck.
  const machineAlready =
    input.ctaState === 'visible' ||
    input.ctaState === 'entering' ||
    input.ctaState === 'exiting';
  return {
    show: true,
    forceCtaVisible: !machineAlready,
    reason: null,
  };
}

export type HostOverlayRepairDecision = {
  /** Host must clear transitioning / dim / held-card pins. */
  shouldRepair: boolean;
  reason: string | null;
};

/**
 * When runtime is idle+empty, stale host shadow (transitioning, dim, held card)
 * must repair. Does not require overboard-specific completion seq.
 */
export function decideHostOverlayRepairAfterIdleEmpty(input: {
  runtime: NotificationRuntimeState;
  notificationChainTransitioning: boolean;
  visualQueueDimSession: boolean;
  notificationOverlayMounted: boolean;
  hostResultActive: boolean;
  heldUserCardActive: boolean;
}): HostOverlayRepairDecision {
  if (!isRuntimeIdleEmpty(input.runtime)) {
    return { shouldRepair: false, reason: 'runtime-not-idle-empty' };
  }
  if (
    input.notificationChainTransitioning ||
    input.visualQueueDimSession ||
    input.notificationOverlayMounted ||
    input.hostResultActive ||
    input.heldUserCardActive
  ) {
    return { shouldRepair: true, reason: 'stale-host-shadow' };
  }
  return { shouldRepair: false, reason: null };
}

/**
 * Overlay product visibility: runtime overlay lifecycle OR (valid completing
 * transition with an active display). Idle+empty ⇒ never visible.
 */
export function decideOverlayProductVisible(
  state: NotificationRuntimeState,
): boolean {
  if (isRuntimeIdleEmpty(state)) return false;
  if (selectOverlayVisible(state)) return true;
  // Completing with a still-present display head is a valid transition frame.
  if (
    state.lifecycle.status === 'completing' &&
    (state.display.kind != null || state.display.payload != null)
  ) {
    return true;
  }
  return false;
}

/**
 * Empty shell = host claims overlay mount while runtime has nothing to show
 * and is not in a valid overlay/transition frame.
 */
export function isIllegalEmptyOverlayShell(input: {
  runtime: NotificationRuntimeState;
  notificationOverlayMounted: boolean;
}): boolean {
  if (!input.notificationOverlayMounted) return false;
  return !decideOverlayProductVisible(input.runtime);
}

/**
 * Remount / already-released: CTA must restore without waiting for a
 * false→true edge (edge detector seeds previous=null and skips first paint).
 */
export function shouldRestoreCtaOnReleasedPresentation(input: {
  presentationFullyReleased: boolean;
  previousReleased: boolean | null;
  ctaState: LobbyCtaEligibilityInput['ctaState'];
  phaseIdle: boolean;
}): boolean {
  if (!input.presentationFullyReleased || !input.phaseIdle) return false;
  if (
    input.ctaState === 'visible' ||
    input.ctaState === 'entering' ||
    input.ctaState === 'exiting'
  ) {
    return false;
  }
  // Edge false→true OR remount while already released.
  if (input.previousReleased === null) return true;
  if (input.previousReleased === false) return true;
  return false;
}

export function presentationReleasedFromSnapshot(
  snap: PostNotificationPresentationSnapshot,
): boolean {
  return isPostNotificationPresentationFullyReleased(snap);
}
