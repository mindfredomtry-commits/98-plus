'use client';

/**
 * Thin BOOT/LOBBY/WHO/WHAT/LEGACY_FLOW adapter — state authority only.
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
 * LEGACY_FLOW is non-rendering for owner — InstantBanFlow keeps painting CONFIRM.
 * WHAT keeps InstantBanFlow mounted (WhatScreen paint path unchanged).
 */
export function planBootLobbyVisuals(presentation: BootLobbyPresentation): {
  showLobbyBootLogoShell: boolean;
  mountInstantBanFlowWhenArenaVisible: true;
  showBottomNavWhenIntroComplete: boolean;
  ownerWhoActive: boolean;
  ownerWhatActive: boolean;
  ownerLegacyFlowActive: boolean;
} {
  const isBoot = presentation.kind === 'BOOT';
  return {
    showLobbyBootLogoShell: isBoot,
    mountInstantBanFlowWhenArenaVisible: true,
    showBottomNavWhenIntroComplete: !isBoot,
    ownerWhoActive: presentation.kind === 'WHO',
    ownerWhatActive: presentation.kind === 'WHAT',
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
  ownerWhatActive: boolean;
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
      presentation.kind === 'WHAT' ||
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
    ownerWhatActive: plan.ownerWhatActive,
    ownerLegacyFlowActive: plan.ownerLegacyFlowActive,
  };
}

/**
 * InstantBanFlow projection of owner WHO ↔ selectingTarget and WHAT ↔ composingBan.
 * One-way: owner → legacy phase. Never writes back into the owner.
 *
 * CLOSE applies only on WHO → LOBBY (explicit dismiss/reset), never on
 * WHO → WHAT or WHAT → LEGACY_FLOW. LEGACY_FLOW never forces idle/WHO/WHAT.
 */
export function useNotificationOwnerWhoProjection(
  phase: string,
  applyWhoPhase: () => void,
  applyLobbyFromWho: () => void,
  /** Kept for call-site compatibility; WHAT/LEGACY_FLOW are the real handoff guards. */
  suppressLobbyWhoCloseRef: { current: boolean },
  applyWhatPhase: () => void,
): {
  ownerWhoActive: boolean;
  ownerWhatActive: boolean;
  ownerLegacyFlowActive: boolean;
  ownerKind: BootLobbyPresentation['kind'];
} {
  const presentation = useSyncExternalStore(
    subscribeNotificationOwnerBootLobby,
    () => getNotificationOwnerBootLobbyState().presentation,
    () => getNotificationOwnerBootLobbyState().presentation,
  );

  const ownerWhoActive = presentation.kind === 'WHO';
  const ownerWhatActive = presentation.kind === 'WHAT';
  const ownerLegacyFlowActive = presentation.kind === 'LEGACY_FLOW';
  const prevKindRef = useRef(presentation.kind);

  useEffect(() => {
    const kind = presentation.kind;
    const prev = prevKindRef.current;
    prevKindRef.current = kind;

    // Never project while legacy InstantBanFlow owns CONFIRM.
    if (kind === 'LEGACY_FLOW') {
      return;
    }

    if (kind === 'WHAT') {
      if (phase !== 'composingBan') {
        applyWhatPhase();
      }
      return;
    }

    if (kind === 'WHO' && phase !== 'selectingTarget') {
      applyWhoPhase();
      return;
    }

    // Explicit WHO → LOBBY only (CLOSE_WHO / RESET from WHO). Not WHAT/LEGACY.
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
    applyWhatPhase,
    applyLobbyFromWho,
    suppressLobbyWhoCloseRef,
  ]);

  return {
    ownerWhoActive,
    ownerWhatActive,
    ownerLegacyFlowActive,
    ownerKind: presentation.kind,
  };
}
