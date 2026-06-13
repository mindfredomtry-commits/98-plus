'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  isLobbyBootLogoIntroDone,
  isLobbyBootScaleIntroDone,
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
  | 'ringEnter'
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
  if (isLobbyBootLogoIntroDone()) return 'ringEnter';
  return 'logoEnter';
}

/**
 * Launch intro: logoEnter → ringEnter → energyFill → lobbyReveal (primed).
 * Logo and ring scale separately; energy target frozen when fill starts.
 */
export function useBootSceneIntro(targetRingPercent: number, energyKnown: boolean) {
  const target = clampPercent(targetRingPercent);
  const [frozenFillTarget, setFrozenFillTarget] = useState<number | null>(() => {
    if (!isLobbyBootIntroPrimed()) return null;
    return getLobbyBootIntroPrimedSnapshot().ringPercent;
  });

  const [launchStage, setLaunchStage] = useState<LaunchStage>(resolveInitialStage);

  const canRunLogoVisual =
    shouldRunLobbyBootIntroVisualSync() && !prefersReducedMotion();
  const canRunRingVisual =
    shouldRunLobbyBootIntroVisualSync() && !shouldSkipBootSceneIntro();

  const logoScaleActive = launchStage === 'logoEnter' && canRunLogoVisual;
  const ringScaleActive = launchStage === 'ringEnter' && canRunRingVisual;
  const fillActive = launchStage === 'energyFill';
  const waitingEnergy = launchStage === 'energyWait';
  const logoLocked =
    launchStage === 'ringEnter' ||
    launchStage === 'energyWait' ||
    launchStage === 'energyFill' ||
    launchStage === 'done';
  const ringScaleLocked =
    launchStage === 'energyWait' ||
    launchStage === 'energyFill' ||
    launchStage === 'done';

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

  const beginEnergyFill = useCallback((frozenTarget: number) => {
    setFrozenFillTarget((prev) =>
      prev === null ? clampPercent(frozenTarget) : prev,
    );
    setLaunchStage('energyFill');
  }, []);

  const onLogoScaleEnd = useCallback(() => {
    if (launchStage !== 'logoEnter') return;
    recordBootIntroEndCall();
    markLobbyBootLogoIntroDone();
    setLaunchStage('ringEnter');
  }, [launchStage]);

  const onRingScaleEnd = useCallback(() => {
    if (launchStage !== 'ringEnter') return;
    recordBootIntroEndCall();
    markLobbyBootScaleIntroDone(0);

    if (!energyKnown) {
      setLaunchStage('energyWait');
      return;
    }
    if (target <= 0) {
      finishPrimed(0);
      return;
    }
    beginEnergyFill(target);
  }, [launchStage, energyKnown, target, finishPrimed, beginEnergyFill]);

  const onFillEnd = useCallback(() => {
    if (launchStage !== 'energyFill') return;
    recordBootIntroEndCall();
    finishPrimed(frozenFillTarget ?? target);
  }, [launchStage, target, finishPrimed, frozenFillTarget]);

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
    beginEnergyFill(target);
  }, [launchStage, energyKnown, target, finishPrimed, beginEnergyFill]);

  useEffect(() => {
    if (!logoScaleActive) return;
    recordBootIntroRun();
  }, [logoScaleActive]);

  useEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible:
        logoScaleActive || ringScaleActive || fillActive || waitingEnergy,
      introPrimed: isLobbyBootIntroPrimed() || introPrimed,
      hasPlayedIntro: isLobbyBootIntroPrimed(),
      showBootScene: !isLobbyBootIntroPrimed(),
      launchStage,
    });
  }, [
    logoScaleActive,
    ringScaleActive,
    fillActive,
    waitingEnergy,
    introPrimed,
    launchStage,
  ]);

  const fillTargetPercent = frozenFillTarget ?? 0;
  const visualRingPercent = fillActive ? fillTargetPercent : 0;

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
      logoScaleActive ||
      ringScaleActive ||
      fillActive ||
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
