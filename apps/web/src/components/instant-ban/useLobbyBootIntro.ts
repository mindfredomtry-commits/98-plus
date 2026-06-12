'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  isLobbyBootIntroPrimed,
  isLobbyBootScaleIntroDone,
  markLobbyBootIntroPrimed,
  markLobbyBootScaleIntroDone,
  snapshotLobbyBootIntroHandoff,
  takeLobbyBootIntroHandoff,
} from '@/lib/lobby-boot-intro-session';

type LobbyPhase = 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';

type IntroUiState = 'primed' | 'scale' | 'ring-catchup' | 'idle';

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

  const handoff = takeLobbyBootIntroHandoff();
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

/**
 * Boot lobby intro — CSS transform + SVG stroke (no per-frame React setState).
 */
export function useLobbyBootIntro(targetRingPercent: number, options: Options) {
  const target = clampPercent(targetRingPercent);
  const enabled = options.enabled !== false;
  const energyKnown = options.energyKnown;

  const initial = useRef(resolveIntroUiState(target, energyKnown)).current;
  const [uiState, setUiState] = useState<IntroUiState>(initial.ui);
  const [ringDisplayPercent, setRingDisplayPercent] = useState(initial.ringPercent);

  const ringRef = useRef(ringDisplayPercent);
  ringRef.current = ringDisplayPercent;
  const targetRef = useRef(target);
  targetRef.current = target;

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

    const skip =
      options.sendStarted ||
      options.phase !== 'idle' ||
      prefersReducedMotion();

    if (skip) {
      skipToFinal();
    }
  }, [
    enabled,
    energyKnown,
    target,
    options.sendStarted,
    options.phase,
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
    setUiState('ring-catchup');
    requestAnimationFrame(() => {
      setRingDisplayPercent(target);
    });
  }, [enabled, energyKnown, target, finishPrimed, uiState]);

  useEffect(
    () => () => {
      if (isLobbyBootIntroPrimed()) return;
      snapshotLobbyBootIntroHandoff(1, ringRef.current);
    },
    [],
  );

  const onScaleAnimationEnd = useCallback(() => {
    markLobbyBootScaleIntroDone(ringRef.current);
    if (!energyKnown) {
      setUiState('idle');
    }
  }, [energyKnown]);

  const onRingAnimationEnd = useCallback(() => {
    finishPrimed(targetRef.current);
  }, [finishPrimed]);

  const introActive =
    uiState === 'scale' || uiState === 'ring-catchup';

  const scaleIntroActive = uiState === 'scale';
  const ringIntroActive = uiState === 'scale' && energyKnown;

  return {
    ringDisplayPercent,
    ringTarget: target,
    introActive,
    scaleIntroActive,
    ringIntroActive,
    ringCatchupActive: uiState === 'ring-catchup',
    skipIntro: uiState === 'primed',
    isAnimating: introActive,
    isFilling: ringIntroActive,
    onScaleAnimationEnd,
    onRingAnimationEnd,
    introPrimed: uiState === 'primed' || isLobbyBootIntroPrimed(),
  };
}
