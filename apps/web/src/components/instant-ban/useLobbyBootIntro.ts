'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  isLobbyBootIntroPrimed,
  isLobbyBootScaleIntroDone,
  LOBBY_BOOT_INTRO_SCALE_START,
  markLobbyBootIntroPrimed,
  markLobbyBootScaleIntroDone,
  peekLobbyBootIntroHandoff,
  shouldRunLobbyBootIntroVisualSync,
  snapshotLobbyBootIntroHandoff,
  takeLobbyBootIntroHandoff,
} from '@/lib/lobby-boot-intro-session';
import { INFLUENCE_RING_CIRCUMFERENCE } from '@/components/lobby/InfluenceRing';
import { reportLobbyBootIntroDebug } from '@/lib/lobby-boot-intro-debug';

type LobbyPhase = 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';

type IntroUiState = 'primed' | 'scale' | 'ring-fill' | 'ring-catchup' | 'idle';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type Options = {
  phase: LobbyPhase;
  sendStarted: boolean;
  energyKnown: boolean;
  enabled?: boolean;
};

function shouldSkipBootIntroSync(options: Options): boolean {
  if (options.enabled === false) return true;
  return (
    options.sendStarted ||
    options.phase !== 'idle' ||
    prefersReducedMotion()
  );
}

function resolveIntroUiState(
  targetRingPercent: number,
  energyKnown: boolean,
): { ringPercent: number; ui: IntroUiState } {
  if (isLobbyBootIntroPrimed()) {
    const primed = getLobbyBootIntroPrimedSnapshot();
    return {
      ringPercent: energyKnown
        ? clampPercent(targetRingPercent)
        : primed.ringPercent,
      ui: 'primed',
    };
  }

  const handoff = peekLobbyBootIntroHandoff();
  if (handoff) {
    if (handoff.scale < 0.999) {
      return { ringPercent: handoff.ringPercent, ui: 'scale' };
    }
    if (energyKnown && handoff.ringPercent < clampPercent(targetRingPercent)) {
      return { ringPercent: handoff.ringPercent, ui: 'ring-catchup' };
    }
    return { ringPercent: handoff.ringPercent, ui: 'idle' };
  }

  if (isLobbyBootScaleIntroDone()) {
    const snap = getLobbyBootIntroPrimedSnapshot();
    if (energyKnown && snap.ringPercent < clampPercent(targetRingPercent)) {
      return { ringPercent: snap.ringPercent, ui: 'ring-catchup' };
    }
    return { ringPercent: snap.ringPercent, ui: 'idle' };
  }

  return { ringPercent: 0, ui: 'scale' };
}

function resolveInitialIntroState(
  targetRingPercent: number,
  energyKnown: boolean,
  options: Options,
): { ringPercent: number; ui: IntroUiState } {
  if (shouldSkipBootIntroSync(options)) {
    return {
      ringPercent: energyKnown
        ? clampPercent(targetRingPercent)
        : 0,
      ui: 'primed',
    };
  }
  return resolveIntroUiState(targetRingPercent, energyKnown);
}

function buildRingClass(
  scalePending: boolean,
  scaleActive: boolean,
  scaleDone: boolean,
  ringBaseActive: boolean,
  ringFillActive: boolean,
  ringCatchupActive: boolean,
): string {
  const scaleLayer = [
    scalePending ? 'lobby-boot-intro-scale-pending' : '',
    scaleActive ? 'lobby-boot-intro-scale-active' : '',
    scaleDone ? 'lobby-boot-intro-scale-done' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const ringRoot = [
    ringBaseActive ? 'lobby-boot-intro-ring-base' : '',
    ringFillActive ? 'lobby-boot-intro-ring-active' : '',
    ringCatchupActive ? 'lobby-boot-intro-ring-catchup' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return [scaleLayer ? `scale:${scaleLayer}` : '', ringRoot ? `ring:${ringRoot}` : '']
    .filter(Boolean)
    .join(' | ');
}

/**
 * Boot lobby intro — CSS transform + SVG stroke (no per-frame React setState).
 */
export function useLobbyBootIntro(targetRingPercent: number, options: Options) {
  const target = clampPercent(targetRingPercent);
  const enabled = options.enabled !== false;
  const energyKnown = options.energyKnown;

  const initialMetaRef = useRef<{
    ui: IntroUiState;
    ringPercent: number;
    initialState: IntroUiState;
  } | null>(null);
  if (initialMetaRef.current === null) {
    const resolved = resolveInitialIntroState(target, energyKnown, {
      ...options,
      enabled,
    });
    initialMetaRef.current = {
      ui: resolved.ui,
      ringPercent: resolved.ringPercent,
      initialState: resolved.ui,
    };
  }

  const [uiState, setUiState] = useState<IntroUiState>(
    () => initialMetaRef.current!.ui,
  );
  const [ringDisplayPercent, setRingDisplayPercent] = useState(
    () => initialMetaRef.current!.ringPercent,
  );

  const ringRef = useRef(ringDisplayPercent);
  ringRef.current = ringDisplayPercent;
  const uiStateRef = useRef(uiState);
  uiStateRef.current = uiState;
  const targetRef = useRef(target);
  targetRef.current = target;
  const firstRenderIntroRef = useRef(
    initialMetaRef.current!.ui !== 'primed' &&
      shouldRunLobbyBootIntroVisualSync(),
  );
  const hasPaintedOnceRef = useRef(false);

  useLayoutEffect(() => {
    takeLobbyBootIntroHandoff();
    hasPaintedOnceRef.current = true;
  }, []);

  const finishPrimed = useCallback((ring: number) => {
    const clamped = clampPercent(ring);
    setRingDisplayPercent(clamped);
    setUiState('primed');
    markLobbyBootIntroPrimed(clamped, 1);
  }, []);

  const skipToFinal = useCallback(() => {
    finishPrimed(energyKnown ? targetRef.current : ringRef.current);
  }, [energyKnown, finishPrimed]);

  useEffect(() => {
    if (!enabled) return;

    if (isLobbyBootIntroPrimed() || uiState === 'primed') {
      const primed = getLobbyBootIntroPrimedSnapshot();
      setRingDisplayPercent(energyKnown ? target : primed.ringPercent);
      setUiState('primed');
      return;
    }

    if (shouldSkipBootIntroSync({ ...options, enabled })) {
      skipToFinal();
    }
  }, [
    enabled,
    energyKnown,
    target,
    options.sendStarted,
    options.phase,
    options.enabled,
    skipToFinal,
    uiState,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (uiState === 'primed' || isLobbyBootIntroPrimed()) return;
    if (!energyKnown) return;
    if (uiState !== 'idle' && uiState !== 'ring-catchup') return;
    if (ringRef.current >= target) {
      finishPrimed(target);
      return;
    }
    if (uiState === 'ring-catchup') return;
    setUiState('ring-catchup');
    setRingDisplayPercent(ringRef.current);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRingDisplayPercent(target);
      });
    });
  }, [enabled, energyKnown, target, finishPrimed, uiState]);

  useEffect(
    () => () => {
      if (isLobbyBootIntroPrimed()) return;
      const state = uiStateRef.current;
      const scale =
        state === 'scale' ? LOBBY_BOOT_INTRO_SCALE_START : 1;
      snapshotLobbyBootIntroHandoff(scale, ringRef.current);
    },
    [],
  );

  const onScaleAnimationEnd = useCallback(() => {
    markLobbyBootScaleIntroDone(ringRef.current);
    if (energyKnown) {
      setUiState('ring-fill');
    } else {
      setUiState('idle');
    }
  }, [energyKnown]);

  const onRingAnimationEnd = useCallback(() => {
    finishPrimed(targetRef.current);
  }, [finishPrimed]);

  const skipIntro = uiState === 'primed' || isLobbyBootIntroPrimed();

  const introActive =
    uiState === 'scale' ||
    uiState === 'ring-fill' ||
    uiState === 'ring-catchup' ||
    uiState === 'idle';

  const bootIntroInitial =
    enabled && !skipIntro && introActive && shouldRunLobbyBootIntroVisualSync();

  const scaleIntroDone = bootIntroInitial && isLobbyBootScaleIntroDone();
  const scaleLayerHeld = bootIntroInitial;
  const scaleAnimating =
    scaleLayerHeld && uiState === 'scale' && !scaleIntroDone;
  const scalePending = scaleAnimating;
  const scaleActive = scaleAnimating;
  const scaleDone = scaleLayerHeld && scaleIntroDone;

  const ringCatchupActive = uiState === 'ring-catchup';
  const ringCssFillActive =
    bootIntroInitial &&
    energyKnown &&
    (uiState === 'scale' || uiState === 'ring-fill');
  const ringBootBaseActive = bootIntroInitial;
  const bootCssFillActive = ringBootBaseActive && !ringCatchupActive;

  const ringClass = buildRingClass(
    scalePending,
    scaleActive,
    scaleDone,
    ringBootBaseActive,
    ringCssFillActive,
    ringCatchupActive,
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    const strokeDashoffset = bootCssFillActive
      ? 'css-driven'
      : String(
          INFLUENCE_RING_CIRCUMFERENCE -
            (ringDisplayPercent / 100) * INFLUENCE_RING_CIRCUMFERENCE,
        );
    reportLobbyBootIntroDebug({
      ringIntroState: uiState,
      energyKnown,
      targetProgress: target,
      ringClass,
      strokeDashoffset,
      firstRenderIntro: firstRenderIntroRef.current,
      initialState: initialMetaRef.current!.initialState,
      hasPaintedOnce: hasPaintedOnceRef.current,
      bootIntroInitial,
      introPrimed: skipIntro,
      appHydrated:
        typeof document !== 'undefined' &&
        document.documentElement.dataset.appHydrated === 'true',
    });
  }, [
    enabled,
    uiState,
    energyKnown,
    target,
    ringClass,
    bootCssFillActive,
    ringDisplayPercent,
    bootIntroInitial,
    skipIntro,
  ]);

  return {
    ringDisplayPercent,
    ringTarget: target,
    introActive,
    bootIntroActive: bootIntroInitial,
    bootIntroInitial,
    scaleIntroActive: scaleActive,
    scalePending,
    scaleActive,
    scaleDone,
    ringBootBaseActive,
    ringIntroActive: ringCssFillActive,
    ringCssFillActive,
    bootCssFillActive,
    ringCatchupActive,
    skipIntro,
    isAnimating: introActive,
    isFilling: ringCssFillActive,
    onScaleAnimationEnd,
    onRingAnimationEnd,
    introPrimed: skipIntro,
  };
}
