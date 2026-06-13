'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  markLobbyBootIntroPrimed,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';
import {
  patchBootHandoffDebug,
  recordBootIntroEndCall,
  recordBootIntroRun,
  recordBootMarkPrimedCall,
} from '@/lib/boot-handoff-debug';

const BOOT_INTRO_MS = 580;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function shouldSkipBootSceneIntro(): boolean {
  return prefersReducedMotion() || hasPlayedLobbyBootIntroThisSession();
}

/**
 * Boot scene intro only — parallel CSS scale + ring fill (550ms), once per session.
 * Lobby orb never uses this hook.
 */
export function useBootSceneIntro(targetRingPercent: number, energyKnown: boolean) {
  const target = clampPercent(targetRingPercent);

  const [introPrimed, setIntroPrimed] = useState(() =>
    isLobbyBootIntroPrimed() || shouldSkipBootSceneIntro(),
  );

  const introActive =
    !introPrimed &&
    shouldRunLobbyBootIntroVisualSync() &&
    !shouldSkipBootSceneIntro();

  const bootFillActive = introActive;

  const finishPrimed = useCallback(
    (ring: number) => {
      if (isLobbyBootIntroPrimed()) {
        setIntroPrimed(true);
        return;
      }
      const clamped = clampPercent(ring);
      setIntroPrimed(true);
      markLobbyBootIntroPrimed(clamped, 1);
      recordBootMarkPrimedCall();
    },
    [],
  );

  useLayoutEffect(() => {
    if (shouldSkipBootSceneIntro() && !isLobbyBootIntroPrimed()) {
      finishPrimed(energyKnown ? target : 0);
    }
  }, [energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (!isLobbyBootIntroPrimed() || introPrimed) return;
    setIntroPrimed(true);
  }, [introPrimed]);

  const onIntroEnd = useCallback(() => {
    recordBootIntroEndCall();
    finishPrimed(energyKnown ? target : getLobbyBootIntroPrimedSnapshot().ringPercent);
  }, [energyKnown, target, finishPrimed]);

  useEffect(() => {
    if (!introActive) return;
    recordBootIntroRun();
  }, [introActive]);

  useEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible: introActive,
      introPrimed: isLobbyBootIntroPrimed() || introPrimed,
      hasPlayedIntro: isLobbyBootIntroPrimed(),
      showBootScene: !isLobbyBootIntroPrimed(),
    });
  }, [introActive, introPrimed]);

  const ringTargetPercent = energyKnown ? target : 0;

  return {
    introActive,
    introPrimed,
    bootFillActive,
    ringTargetPercent,
    onIntroEnd,
    bootIntroMs: BOOT_INTRO_MS,
  };
}
