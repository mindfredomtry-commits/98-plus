'use client';

/**
 * Thin BOOT/LOBBY/WHO/WHAT/CONFIRM/SUCCESS/LEGACY_FLOW adapter — state authority only.
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
 * SUCCESS / CONFIRM / WHAT / WHO keep InstantBanFlow mounted (existing paint paths).
 * SUCCESS has no legacy phase projection — paint stays banSentSuccess + snapshot.
 * LEGACY_FLOW is non-rendering for owner.
 */
export function planBootLobbyVisuals(presentation: BootLobbyPresentation): {
  showLobbyBootLogoShell: boolean;
  mountInstantBanFlowWhenArenaVisible: true;
  showBottomNavWhenIntroComplete: boolean;
  ownerWhoActive: boolean;
  ownerWhatActive: boolean;
  ownerConfirmActive: boolean;
  ownerSuccessActive: boolean;
  ownerLegacyFlowActive: boolean;
} {
  const isBoot = presentation.kind === 'BOOT';
  return {
    showLobbyBootLogoShell: isBoot,
    mountInstantBanFlowWhenArenaVisible: true,
    showBottomNavWhenIntroComplete: !isBoot,
    ownerWhoActive: presentation.kind === 'WHO',
    ownerWhatActive: presentation.kind === 'WHAT',
    ownerConfirmActive: presentation.kind === 'CONFIRM',
    ownerSuccessActive: presentation.kind === 'SUCCESS',
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
  ownerConfirmActive: boolean;
  ownerSuccessActive: boolean;
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
      presentation.kind === 'CONFIRM' ||
      presentation.kind === 'SUCCESS' ||
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
    ownerConfirmActive: plan.ownerConfirmActive,
    ownerSuccessActive: plan.ownerSuccessActive,
    ownerLegacyFlowActive: plan.ownerLegacyFlowActive,
  };
}

/**
 * InstantBanFlow projection of owner WHO/WHAT/CONFIRM → legacy phases.
 * One-way: owner → legacy phase. Never writes back into the owner.
 *
 * SUCCESS has no legacy phase projection (paint remains banSentSuccess + snapshot).
 * CLOSE applies only on WHO → LOBBY (explicit dismiss/reset).
 * LEGACY_FLOW never forces idle/WHO/WHAT/CONFIRM/SUCCESS.
 */
export function useNotificationOwnerWhoProjection(
  phase: string,
  applyWhoPhase: () => void,
  applyLobbyFromWho: () => void,
  /** Kept for call-site compatibility; WHAT/CONFIRM/LEGACY are the real handoff guards. */
  suppressLobbyWhoCloseRef: { current: boolean },
  applyWhatPhase: () => void,
  applyConfirmPhase: () => void,
): {
  ownerWhoActive: boolean;
  ownerWhatActive: boolean;
  ownerConfirmActive: boolean;
  ownerSuccessActive: boolean;
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
  const ownerConfirmActive = presentation.kind === 'CONFIRM';
  const ownerSuccessActive = presentation.kind === 'SUCCESS';
  const ownerLegacyFlowActive = presentation.kind === 'LEGACY_FLOW';
  const prevKindRef = useRef(presentation.kind);

  useEffect(() => {
    const kind = presentation.kind;
    const prev = prevKindRef.current;
    prevKindRef.current = kind;

    // Never project while parked on reserved LEGACY_FLOW.
    if (kind === 'LEGACY_FLOW') {
      return;
    }

    // SUCCESS: no phase === 'success' — local paint owns materialization.
    if (kind === 'SUCCESS') {
      return;
    }

    if (kind === 'CONFIRM') {
      if (phase !== 'confirming') {
        applyConfirmPhase();
      }
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

    // Explicit WHO → LOBBY only (CLOSE_WHO / RESET from WHO).
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
    applyConfirmPhase,
    applyLobbyFromWho,
    suppressLobbyWhoCloseRef,
  ]);

  return {
    ownerWhoActive,
    ownerWhatActive,
    ownerConfirmActive,
    ownerSuccessActive,
    ownerLegacyFlowActive,
    ownerKind: presentation.kind,
  };
}
