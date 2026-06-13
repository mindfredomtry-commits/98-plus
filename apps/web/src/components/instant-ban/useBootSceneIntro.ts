'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  markLobbyBootIntroPrimed,
  markLobbyBootScaleIntroDone,
  isLobbyBootScaleIntroDone,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';
import {
  patchBootHandoffDebug,
  recordBootIntroEndCall,
  recordBootIntroRun,
  recordBootMarkPrimedCall,
} from '@/lib/boot-handoff-debug';

const SCALE_MS = 550;
const FILL_MS = 550;

export type LaunchStage =
  | 'done'
  | 'orbEnter'
  | 'energyWait'
  | 'energyFill';

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

function resolveInitialStage(): LaunchStage {
  if (isLobbyBootIntroPrimed() || shouldSkipBootSceneIntro()) return 'done';
  if (isLobbyBootScaleIntroDone()) return 'energyWait';
  return 'orbEnter';
}

/**
 * Launch intro state machine: orbEnter → energyFill → lobbyReveal (primed).
 * Scale runs once; ring fill runs after scale locks, separately.
 */
export function useBootSceneIntro(targetRingPercent: number, energyKnown: boolean) {
  const target = clampPercent(targetRingPercent);

  const [launchStage, setLaunchStage] = useState<LaunchStage>(resolveInitialStage);

  const scaleActive =
    launchStage === 'orbEnter' &&
    shouldRunLobbyBootIntroVisualSync() &&
    !shouldSkipBootSceneIntro();

  const fillActive = launchStage === 'energyFill';
  const waitingEnergy = launchStage === 'energyWait';
  const scaleLocked =
    launchStage === 'energyWait' ||
    launchStage === 'energyFill' ||
    launchStage === 'done';

  const introPrimed =
    launchStage === 'done' || isLobbyBootIntroPrimed();

  const finishPrimed = useCallback(
    (ring: number) => {
      if (isLobbyBootIntroPrimed()) {
        setLaunchStage('done');
        return;
      }
      const clamped = clampPercent(ring);
      markLobbyBootIntroPrimed(clamped, 1);
      recordBootMarkPrimedCall();
      setLaunchStage('done');
    },
    [],
  );

  const onScaleEnd = useCallback(() => {
    if (launchStage !== 'orbEnter') return;
    recordBootIntroEndCall();
    markLobbyBootScaleIntroDone(energyKnown ? target : 0);

    if (!energyKnown) {
      setLaunchStage('energyWait');
      return;
    }
    if (target <= 0) {
      finishPrimed(0);
      return;
    }
    setLaunchStage('energyFill');
  }, [launchStage, energyKnown, target, finishPrimed]);

  const onFillEnd = useCallback(() => {
    if (launchStage !== 'energyFill') return;
    recordBootIntroEndCall();
    finishPrimed(energyKnown ? target : getLobbyBootIntroPrimedSnapshot().ringPercent);
  }, [launchStage, energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (shouldSkipBootSceneIntro() && !isLobbyBootIntroPrimed()) {
      finishPrimed(energyKnown ? target : 0);
    }
  }, [energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (isLobbyBootIntroPrimed() && launchStage !== 'done') {
      setLaunchStage('done');
    }
  }, [launchStage]);

  useEffect(() => {
    if (launchStage !== 'energyWait' || !energyKnown) return;
    if (target <= 0) {
      finishPrimed(0);
      return;
    }
    setLaunchStage('energyFill');
  }, [launchStage, energyKnown, target, finishPrimed]);

  useEffect(() => {
    if (!scaleActive) return;
    recordBootIntroRun();
  }, [scaleActive]);

  useEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible: scaleActive || fillActive || waitingEnergy,
      introPrimed: isLobbyBootIntroPrimed() || introPrimed,
      hasPlayedIntro: isLobbyBootIntroPrimed(),
      showBootScene: !isLobbyBootIntroPrimed(),
      launchStage,
    });
  }, [scaleActive, fillActive, waitingEnergy, introPrimed, launchStage]);

  const ringTargetPercent = energyKnown ? target : 0;
  const visualRingPercent = fillActive ? ringTargetPercent : 0;

  return {
    launchStage,
    scaleActive,
    fillActive,
    waitingEnergy,
    scaleLocked,
    introPrimed,
    bootIntroActive: scaleActive || fillActive || waitingEnergy,
    ringTargetPercent,
    visualRingPercent,
    onScaleEnd,
    onFillEnd,
    scaleMs: SCALE_MS,
    fillMs: FILL_MS,
  };
}
