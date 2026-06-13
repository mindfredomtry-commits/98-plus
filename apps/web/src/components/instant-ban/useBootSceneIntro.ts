'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  isLobbyBootLogoIntroDone,
  markLobbyBootIntroPrimed,
  markLobbyBootLogoIntroDone,
  markLobbyBootScaleIntroDone,
  rememberLobbyRingPercent,
  resolveBootFillTarget,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';
import {
  LOGO_SCALE_DELAY_MS,
  LOGO_SCALE_MS,
  MAX_BOOT_DURATION_MS,
  RING_FILL_MS,
} from '@/lib/lobby-boot-timing';
import {
  patchBootHandoffDebug,
  recordBootIntroEndCall,
  recordBootIntroRun,
  recordBootMarkPrimedCall,
} from '@/lib/boot-handoff-debug';

export type LaunchStage = 'done' | 'logoEnter' | 'ringAndFill';

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
  if (isLobbyBootLogoIntroDone()) return 'ringAndFill';
  return 'logoEnter';
}

/**
 * Launch intro: logoEnter → ringAndFill (parallel ring scale + energy fill) → primed ≤1s.
 * Never waits on API / energy / session.
 */
export function useBootSceneIntro(targetRingPercent: number, energyKnown: boolean) {
  const target = clampPercent(targetRingPercent);
  const bootStartedRef = useRef(false);

  const [frozenFillTarget, setFrozenFillTarget] = useState<number | null>(() => {
    if (isLobbyBootIntroPrimed()) {
      return getLobbyBootIntroPrimedSnapshot().ringPercent;
    }
    if (isLobbyBootLogoIntroDone()) {
      return resolveBootFillTarget(energyKnown, target);
    }
    return null;
  });

  const [launchStage, setLaunchStage] = useState<LaunchStage>(resolveInitialStage);

  const canRunRingVisual =
    shouldRunLobbyBootIntroVisualSync() && !shouldSkipBootSceneIntro();

  const logoScaleActive = launchStage === 'logoEnter' && !prefersReducedMotion();
  const ringAndFillActive = launchStage === 'ringAndFill';
  const ringScaleActive = ringAndFillActive && canRunRingVisual;
  const fillActive = ringAndFillActive && frozenFillTarget !== null;
  const logoLocked =
    launchStage === 'ringAndFill' || launchStage === 'done';
  const ringScaleLocked = launchStage === 'done' || isLobbyBootIntroPrimed();

  const introPrimed = launchStage === 'done' || isLobbyBootIntroPrimed();

  const finishPrimed = useCallback(
    (ring: number) => {
      if (isLobbyBootIntroPrimed()) {
        setLaunchStage('done');
        return;
      }
      const clamped = clampPercent(ring);
      markLobbyBootIntroPrimed(clamped, 1);
      recordBootMarkPrimedCall();
      setFrozenFillTarget(clamped);
      setLaunchStage('done');
    },
    [],
  );

  const beginRingAndFill = useCallback((energyTarget: number | null) => {
    setFrozenFillTarget(energyTarget);
    setLaunchStage('ringAndFill');
  }, []);

  const onLogoScaleEnd = useCallback(() => {
    if (launchStage !== 'logoEnter') return;
    recordBootIntroEndCall();
    markLobbyBootLogoIntroDone();
    beginRingAndFill(resolveBootFillTarget(energyKnown, target));
  }, [launchStage, energyKnown, target, beginRingAndFill]);

  const onRingScaleEnd = useCallback(() => {
    if (launchStage !== 'ringAndFill') return;
    markLobbyBootScaleIntroDone(frozenFillTarget ?? 0);
    if (frozenFillTarget === null) {
      recordBootIntroEndCall();
      finishPrimed(0);
    }
  }, [launchStage, frozenFillTarget, finishPrimed]);

  const onFillEnd = useCallback(() => {
    if (launchStage !== 'ringAndFill' || frozenFillTarget === null) return;
    recordBootIntroEndCall();
    finishPrimed(frozenFillTarget);
  }, [launchStage, frozenFillTarget, finishPrimed]);

  useLayoutEffect(() => {
    if (!shouldSkipBootSceneIntro() || isLobbyBootIntroPrimed()) return;
    finishPrimed(resolveBootFillTarget(energyKnown, target) ?? 0);
  }, [energyKnown, target, finishPrimed]);

  useLayoutEffect(() => {
    if (isLobbyBootIntroPrimed() && launchStage !== 'done') {
      setFrozenFillTarget(getLobbyBootIntroPrimedSnapshot().ringPercent);
      setLaunchStage('done');
    }
  }, [launchStage]);

  useEffect(() => {
    if (energyKnown) rememberLobbyRingPercent(target);
  }, [energyKnown, target]);

  useEffect(() => {
    if (!energyKnown || launchStage !== 'ringAndFill') return;
    if (frozenFillTarget !== null) return;
    setFrozenFillTarget(clampPercent(target));
  }, [energyKnown, target, launchStage, frozenFillTarget]);

  useEffect(() => {
    if (shouldSkipBootSceneIntro() || isLobbyBootIntroPrimed()) return;
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const timer = window.setTimeout(() => {
      if (isLobbyBootIntroPrimed()) return;
      finishPrimed(frozenFillTarget ?? 0);
    }, MAX_BOOT_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [energyKnown, target, frozenFillTarget, finishPrimed]);

  useEffect(() => {
    if (!logoScaleActive) return;
    recordBootIntroRun();
  }, [logoScaleActive]);

  useEffect(() => {
    patchBootHandoffDebug({
      bootSceneVisible: logoScaleActive || ringAndFillActive,
      introPrimed: isLobbyBootIntroPrimed() || introPrimed,
      hasPlayedIntro: isLobbyBootIntroPrimed(),
      showBootScene: !isLobbyBootIntroPrimed(),
      launchStage,
    });
  }, [logoScaleActive, ringAndFillActive, introPrimed, launchStage]);

  const fillTargetPercent = frozenFillTarget ?? 0;
  const visualRingPercent = ringAndFillActive ? fillTargetPercent : 0;

  return {
    launchStage,
    logoScaleActive,
    ringScaleActive,
    fillActive,
    logoLocked,
    ringScaleLocked,
    introPrimed,
    bootIntroActive: launchStage === 'logoEnter' || ringAndFillActive,
    fillTargetPercent,
    visualRingPercent,
    onLogoScaleEnd,
    onRingScaleEnd,
    onFillEnd,
    logoScaleDelayMs: LOGO_SCALE_DELAY_MS,
    logoScaleMs: LOGO_SCALE_MS,
    ringScaleMs: RING_FILL_MS,
    fillMs: RING_FILL_MS,
  };
}

export type BootSceneIntroController = ReturnType<typeof useBootSceneIntro>;
