'use client';

/**
 * Thin BOOT/LOBBY/WHO/LEGACY_FLOW adapter — state authority only.
 * Maps owner kinds onto the EXISTING production visual path.
 * Does not mount NotificationPresentation or .np-* surfaces.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  isLobbyBootIntroPrimed,
  subscribeLobbyBootIntroSession,
} from '@/lib/lobby-boot-intro-session';
import {
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
  subscribeNotificationOwnerBootLobby,
} from './boot-lobby.store';
import type { BootLobbyPresentation } from './boot-lobby.types';

/**
 * Pure visual plan for the production page.
 * LEGACY_FLOW is non-rendering for owner — InstantBanFlow keeps painting WHAT.
 */
export function planBootLobbyVisuals(presentation: BootLobbyPresentation): {
  showLobbyBootLogoShell: boolean;
  mountInstantBanFlowWhenArenaVisible: true;
  showBottomNavWhenIntroComplete: boolean;
  ownerWhoActive: boolean;
  ownerLegacyFlowActive: boolean;
} {
  const isBoot = presentation.kind === 'BOOT';
  return {
    showLobbyBootLogoShell: isBoot,
    mountInstantBanFlowWhenArenaVisible: true,
    showBottomNavWhenIntroComplete: !isBoot,
    ownerWhoActive: presentation.kind === 'WHO',
    ownerLegacyFlowActive: presentation.kind === 'LEGACY_FLOW',
  };
}

/**
 * Bridge: when the existing lobby boot intro finishes priming, owner advances
 * BOOT → LOBBY. Intro animation remains owned by useBootSceneIntro /
 * LobbyBootLogoShell — owner only records the macro transition.
 */
export function useNotificationOwnerBootLobbyBridge(): {
  presentation: BootLobbyPresentation;
  showLobbyBootLogoShell: boolean;
  showBottomNavWhenIntroComplete: boolean;
  ownerWhoActive: boolean;
  ownerLegacyFlowActive: boolean;
} {
  const presentation = useSyncExternalStore(
    subscribeNotificationOwnerBootLobby,
    () => getNotificationOwnerBootLobbyState().presentation,
    () => getNotificationOwnerBootLobbyState().presentation,
  );

  const lobbyBootIntroDone = useSyncExternalStore(
    subscribeLobbyBootIntroSession,
    isLobbyBootIntroPrimed,
    isLobbyBootIntroPrimed,
  );

  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    if (!lobbyBootIntroDone) return;
    if (
      presentation.kind === 'LOBBY' ||
      presentation.kind === 'WHO' ||
      presentation.kind === 'LEGACY_FLOW'
    ) {
      completedRef.current = true;
      return;
    }
    completedRef.current = true;
    dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
  }, [lobbyBootIntroDone, presentation.kind]);

  const plan = planBootLobbyVisuals(presentation);
  return {
    presentation,
    showLobbyBootLogoShell: plan.showLobbyBootLogoShell,
    showBottomNavWhenIntroComplete: plan.showBottomNavWhenIntroComplete,
    ownerWhoActive: plan.ownerWhoActive,
    ownerLegacyFlowActive: plan.ownerLegacyFlowActive,
  };
}

/**
 * InstantBanFlow projection of owner WHO ↔ selectingTarget.
 * One-way: owner → legacy phase. Never writes back into the owner.
 *
 * CLOSE applies only on WHO → LOBBY (explicit dismiss/reset), never on
 * WHO → LEGACY_FLOW (WHAT handoff). LEGACY_FLOW never forces idle or WHO.
 */
export function useNotificationOwnerWhoProjection(
  phase: string,
  applyWhoPhase: () => void,
  applyLobbyFromWho: () => void,
  /** Kept for call-site compatibility; LEGACY_FLOW is the real handoff guard. */
  suppressLobbyWhoCloseRef: { current: boolean },
): { ownerWhoActive: boolean; ownerLegacyFlowActive: boolean } {
  const presentation = useSyncExternalStore(
    subscribeNotificationOwnerBootLobby,
    () => getNotificationOwnerBootLobbyState().presentation,
    () => getNotificationOwnerBootLobbyState().presentation,
  );

  const ownerWhoActive = presentation.kind === 'WHO';
  const ownerLegacyFlowActive = presentation.kind === 'LEGACY_FLOW';
  const prevKindRef = useRef(presentation.kind);

  useEffect(() => {
    const kind = presentation.kind;
    const prev = prevKindRef.current;
    prevKindRef.current = kind;

    // Never project while legacy InstantBanFlow owns WHAT/CONFIRM.
    if (kind === 'LEGACY_FLOW') {
      return;
    }

    if (kind === 'WHO' && phase !== 'selectingTarget') {
      applyWhoPhase();
      return;
    }

    // Explicit WHO → LOBBY only (CLOSE_WHO / RESET from WHO). Not LEGACY_FLOW.
    if (
      prev === 'WHO' &&
      kind === 'LOBBY' &&
      phase === 'selectingTarget' &&
      !suppressLobbyWhoCloseRef.current
    ) {
      applyLobbyFromWho();
    }
  }, [
    presentation.kind,
    phase,
    applyWhoPhase,
    applyLobbyFromWho,
    suppressLobbyWhoCloseRef,
  ]);

  return { ownerWhoActive, ownerLegacyFlowActive };
}
