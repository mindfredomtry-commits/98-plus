'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  markLobbyBootIntroPrimed,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';

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

  const [introPrimed, setIntroPrimed] = useState(() => shouldSkipBootSceneIntro());

  const introActive =
    !introPrimed &&
    shouldRunLobbyBootIntroVisualSync() &&
    !shouldSkipBootSceneIntro();

  const bootFillActive = introActive;

  const finishPrimed = useCallback(
    (ring: number) => {
      const clamped = clampPercent(ring);
      setIntroPrimed(true);
      markLobbyBootIntroPrimed(clamped, 1);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!shouldSkipBootSceneIntro() || isLobbyBootIntroPrimed()) return;
    finishPrimed(energyKnown ? target : 0);
  }, [energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (!isLobbyBootIntroPrimed() || introPrimed) return;
    setIntroPrimed(true);
  }, [introPrimed]);

  useEffect(() => {
    if (shouldSkipBootSceneIntro() && !isLobbyBootIntroPrimed()) {
      finishPrimed(energyKnown ? target : 0);
    }
  }, [energyKnown, target, finishPrimed]);

  const onIntroEnd = useCallback(() => {
    finishPrimed(energyKnown ? target : getLobbyBootIntroPrimedSnapshot().ringPercent);
  }, [energyKnown, target, finishPrimed]);

  const ringTargetPercent = energyKnown ? target : 0;

  return {
    introActive,
    introPrimed,
    bootFillActive,
    ringTargetPercent,
    onIntroEnd,
  };
}
