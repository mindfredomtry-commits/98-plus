'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  isLobbyBootLogoIntroDone,
  markLobbyBootIntroPrimed,
  markLobbyBootLogoIntroDone,
  markLobbyBootScaleIntroDone,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';
import {
  patchBootHandoffDebug,
  recordBootIntroEndCall,
  recordBootIntroRun,
  recordBootMarkPrimedCall,
} from '@/lib/boot-handoff-debug';

const LOGO_SCALE_MS = 550;
const RING_SCALE_MS = 550;
const FILL_MS = 550;

export type LaunchStage =
  | 'done'
  | 'logoEnter'
  | 'energyWait'
  | 'ringAndFill';

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
  if (isLobbyBootLogoIntroDone()) return 'energyWait';
  return 'logoEnter';
}

/**
 * Launch intro: logoEnter → ringAndFill (parallel ring scale + energy fill) → primed.
 */
export function useBootSceneIntro(targetRingPercent: number, energyKnown: boolean) {
  const target = clampPercent(targetRingPercent);
  const [frozenFillTarget, setFrozenFillTarget] = useState<number | null>(() => {
    if (!isLobbyBootIntroPrimed()) return null;
    return getLobbyBootIntroPrimedSnapshot().ringPercent;
  });

  const [launchStage, setLaunchStage] = useState<LaunchStage>(resolveInitialStage);

  const canRunRingVisual =
    shouldRunLobbyBootIntroVisualSync() && !shouldSkipBootSceneIntro();

  const logoScaleActive = launchStage === 'logoEnter' && !prefersReducedMotion();
  const ringAndFillActive = launchStage === 'ringAndFill';
  const ringScaleActive = ringAndFillActive && canRunRingVisual;
  const fillActive = ringAndFillActive && frozenFillTarget !== null;
  const waitingEnergy = launchStage === 'energyWait';
  const logoLocked =
    launchStage === 'energyWait' ||
    launchStage === 'ringAndFill' ||
    launchStage === 'done';
  const ringScaleLocked = launchStage === 'done' || isLobbyBootIntroPrimed();

  const introPrimed =
    launchStage === 'done' || isLobbyBootIntroPrimed();

  const finishPrimed = useCallback((ring: number) => {
    if (isLobbyBootIntroPrimed()) {
      setLaunchStage('done');
      return;
    }
    const clamped = clampPercent(ring);
    markLobbyBootIntroPrimed(clamped, 1);
    recordBootMarkPrimedCall();
    setFrozenFillTarget(clamped);
    setLaunchStage('done');
  }, []);

  const beginRingAndFill = useCallback((energyTarget: number) => {
    const clamped = clampPercent(energyTarget);
    setFrozenFillTarget((prev) => (prev === null ? clamped : prev));
    setLaunchStage('ringAndFill');
  }, []);

  const onLogoScaleEnd = useCallback(() => {
    if (launchStage !== 'logoEnter') return;
    recordBootIntroEndCall();
    markLobbyBootLogoIntroDone();
    if (!energyKnown) {
      setLaunchStage('energyWait');
      return;
    }
    if (target <= 0) {
      finishPrimed(0);
      return;
    }
    beginRingAndFill(target);
  }, [launchStage, energyKnown, target, finishPrimed, beginRingAndFill]);

  const onRingScaleEnd = useCallback(() => {
    if (launchStage !== 'ringAndFill') return;
    markLobbyBootScaleIntroDone(frozenFillTarget ?? 0);
  }, [launchStage, frozenFillTarget]);

  const onFillEnd = useCallback(() => {
    if (launchStage !== 'ringAndFill') return;
    recordBootIntroEndCall();
    finishPrimed(frozenFillTarget ?? target);
  }, [launchStage, frozenFillTarget, target, finishPrimed]);

  useLayoutEffect(() => {
    if (!shouldSkipBootSceneIntro() || isLobbyBootIntroPrimed()) return;
    if (!energyKnown) return;
    finishPrimed(target);
  }, [energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (isLobbyBootIntroPrimed() && launchStage !== 'done') {
      setFrozenFillTarget(getLobbyBootIntroPrimedSnapshot().ringPercent);
      setLaunchStage('done');
    }
  }, [launchStage]);

  useEffect(() => {
    if (launchStage !== 'energyWait' || !energyKnown) return;
    if (target <= 0) {
      finishPrimed(0);
      return;
    }
    beginRingAndFill(target);
  }, [launchStage, energyKnown, target, finishPrimed, beginRingAndFill]);

  useEffect(() => {
    if (!logoScaleActive) return;
    recordBootIntroRun();
  }, [logoScaleActive]);

  useEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible:
        logoScaleActive || ringAndFillActive || waitingEnergy,
      introPrimed: isLobbyBootIntroPrimed() || introPrimed,
      hasPlayedIntro: isLobbyBootIntroPrimed(),
      showBootScene: !isLobbyBootIntroPrimed(),
      launchStage,
    });
  }, [
    logoScaleActive,
    ringAndFillActive,
    waitingEnergy,
    introPrimed,
    launchStage,
  ]);

  const fillTargetPercent = frozenFillTarget ?? 0;
  const visualRingPercent = ringAndFillActive ? fillTargetPercent : 0;

  return {
    launchStage,
    logoScaleActive,
    ringScaleActive,
    fillActive,
    waitingEnergy,
    logoLocked,
    ringScaleLocked,
    introPrimed,
    bootIntroActive:
      launchStage === 'logoEnter' ||
      ringAndFillActive ||
      waitingEnergy,
    fillTargetPercent,
    visualRingPercent,
    onLogoScaleEnd,
    onRingScaleEnd,
    onFillEnd,
    logoScaleMs: LOGO_SCALE_MS,
    ringScaleMs: RING_SCALE_MS,
    fillMs: FILL_MS,
  };
}

export type BootSceneIntroController = ReturnType<typeof useBootSceneIntro>;
