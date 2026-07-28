'use client';

/**
 * Thin BOOT/LOBBY/WHO adapter — state authority only.
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
 * InstantBanFlow stays mounted whenever the arena is visible (parity with
 * pre-slice production, where InstantBanFlow coexists under the logo shell).
 * WHO uses the same shell flags as LOBBY — InstantBanFlow renders WhoOverlay.
 */
export function planBootLobbyVisuals(presentation: BootLobbyPresentation): {
  showLobbyBootLogoShell: boolean;
  mountInstantBanFlowWhenArenaVisible: true;
  showBottomNavWhenIntroComplete: boolean;
  ownerWhoActive: boolean;
} {
  const isBoot = presentation.kind === 'BOOT';
  return {
    showLobbyBootLogoShell: isBoot,
    mountInstantBanFlowWhenArenaVisible: true,
    showBottomNavWhenIntroComplete: !isBoot,
    ownerWhoActive: presentation.kind === 'WHO',
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
    if (presentation.kind === 'LOBBY' || presentation.kind === 'WHO') {
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
  };
}

/**
 * InstantBanFlow projection of owner WHO ↔ selectingTarget.
 * One-way: owner → legacy phase. Never writes back into the owner.
 *
 * CLOSE applies only on WHO → non-WHO transitions while phase is still
 * selectingTarget. WHO→WHAT must advance phase (or set suppress) before
 * LEAVE_WHO_FOR_LEGACY_FLOW so Lobby does not flash under WHAT.
 */
export function useNotificationOwnerWhoProjection(
  phase: string,
  applyWhoPhase: () => void,
  applyLobbyFromWho: () => void,
  /** When true, WHO→LOBBY must not force idle (WHO→WHAT handoff). */
  suppressLobbyWhoCloseRef: { current: boolean },
): { ownerWhoActive: boolean } {
  const presentation = useSyncExternalStore(
    subscribeNotificationOwnerBootLobby,
    () => getNotificationOwnerBootLobbyState().presentation,
    () => getNotificationOwnerBootLobbyState().presentation,
  );

  const ownerWhoActive = presentation.kind === 'WHO';
  const prevKindRef = useRef(presentation.kind);

  useEffect(() => {
    const kind = presentation.kind;
    const prev = prevKindRef.current;
    prevKindRef.current = kind;

    if (kind === 'WHO' && phase !== 'selectingTarget') {
      applyWhoPhase();
      return;
    }

    if (
      prev === 'WHO' &&
      kind !== 'WHO' &&
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

  return { ownerWhoActive };
}
