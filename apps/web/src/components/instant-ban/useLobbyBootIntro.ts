'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOBBY_BOOT_INTRO_SCALE_START,
  getLobbyBootIntroPrimedSnapshot,
  isLobbyBootIntroPrimed,
  isLobbyBootScaleIntroDone,
  markLobbyBootIntroPrimed,
  markLobbyBootScaleIntroDone,
  snapshotLobbyBootIntroHandoff,
  takeLobbyBootIntroHandoff,
} from '@/lib/lobby-boot-intro-session';

type LobbyPhase = 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';

const INTRO_DURATION_MS = 650;
const RING_CATCHUP_MS = 450;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type Options = {
  phase: LobbyPhase;
  sendStarted: boolean;
  energyKnown: boolean;
  enabled?: boolean;
};

type IntroMode = 'primed' | 'scale' | 'ring' | 'idle';

function readInitialState(
  targetRingPercent: number,
  energyKnown: boolean,
): { scale: number; ringPercent: number; mode: IntroMode } {
  if (isLobbyBootIntroPrimed()) {
    const primed = getLobbyBootIntroPrimedSnapshot();
    return {
      scale: primed.scale,
      ringPercent: energyKnown
        ? clampPercent(targetRingPercent)
        : primed.ringPercent,
      mode: 'primed',
    };
  }

  const handoff = takeLobbyBootIntroHandoff();
  if (handoff) {
    const scaleDone = handoff.scale >= 0.999;
    return {
      scale: handoff.scale,
      ringPercent: handoff.ringPercent,
      mode: scaleDone ? 'ring' : 'scale',
    };
  }

  return {
    scale: LOBBY_BOOT_INTRO_SCALE_START,
    ringPercent: 0,
    mode: 'scale',
  };
}

export function useLobbyBootIntro(targetRingPercent: number, options: Options) {
  const target = clampPercent(targetRingPercent);
  const enabled = options.enabled !== false;
  const energyKnown = options.energyKnown;

  const initial = useRef(readInitialState(target, energyKnown)).current;

  const [scale, setScale] = useState(initial.scale);
  const [ringDisplayPercent, setRingDisplayPercent] = useState(initial.ringPercent);
  const [isAnimating, setIsAnimating] = useState(
    enabled && initial.mode !== 'primed' && initial.mode !== 'idle',
  );

  const scaleRef = useRef(scale);
  const ringRef = useRef(ringDisplayPercent);
  scaleRef.current = scale;
  ringRef.current = ringDisplayPercent;

  const modeRef = useRef<IntroMode>(initial.mode);
  const introLaunchRef = useRef({
    scale: initial.mode !== 'scale',
    ring: initial.mode !== 'ring',
  });
  const animFrameRef = useRef<number | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  const cancelAnim = useCallback(() => {
    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const applyPrimed = useCallback(
    (finalScale: number, finalRing: number) => {
      cancelAnim();
      const ring = clampPercent(finalRing);
      const s = Math.min(1, Math.max(LOBBY_BOOT_INTRO_SCALE_START, finalScale));
      setScale(s);
      setRingDisplayPercent(ring);
      setIsAnimating(false);
      modeRef.current = 'primed';
      markLobbyBootIntroPrimed(ring, s);
    },
    [cancelAnim],
  );

  const runTimeline = useCallback(
    (
      fromScale: number,
      fromRing: number,
      toScale: number,
      toRing: number,
      durationMs: number,
      ease: (t: number) => number,
      nextMode: IntroMode,
    ) => {
      cancelAnim();
      setIsAnimating(true);
      const startScale = fromScale;
      const startRing = fromRing;
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = ease(t);
        const nextScale = startScale + (toScale - startScale) * eased;
        const nextRing = startRing + (toRing - startRing) * eased;
        setScale(nextScale);
        setRingDisplayPercent(nextRing);
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        animFrameRef.current = null;
        modeRef.current = nextMode;
        if (nextMode === 'primed') {
          applyPrimed(toScale, toRing);
          return;
        }
        if (nextMode === 'idle' && toScale >= 0.999) {
          markLobbyBootScaleIntroDone(toRing);
        }
        setIsAnimating(nextMode !== 'idle');
      };

      animFrameRef.current = requestAnimationFrame(tick);
    },
    [applyPrimed, cancelAnim],
  );

  const startScaleIntro = useCallback(() => {
    if (!enabled || modeRef.current === 'primed') return;
    const ringGoal = energyKnown ? targetRef.current : ringRef.current;
    runTimeline(
      scaleRef.current,
      ringRef.current,
      1,
      ringGoal,
      INTRO_DURATION_MS,
      easeOutBack,
      energyKnown ? 'primed' : 'idle',
    );
  }, [enabled, energyKnown, runTimeline]);

  const startRingCatchup = useCallback(() => {
    if (!enabled || modeRef.current === 'primed') return;
    if (!energyKnown) return;
    const goal = targetRef.current;
    if (ringRef.current >= goal && scaleRef.current >= 1) {
      applyPrimed(1, goal);
      return;
    }
    modeRef.current = 'ring';
    runTimeline(
      scaleRef.current,
      ringRef.current,
      1,
      goal,
      RING_CATCHUP_MS,
      easeOutCubic,
      'primed',
    );
  }, [applyPrimed, enabled, energyKnown, runTimeline]);

  useEffect(() => {
    if (!enabled) return;

    if (isLobbyBootIntroPrimed() || modeRef.current === 'primed') {
      const primed = getLobbyBootIntroPrimedSnapshot();
      setScale(primed.scale);
      setRingDisplayPercent(energyKnown ? target : primed.ringPercent);
      setIsAnimating(false);
      return;
    }

    const skip =
      options.sendStarted ||
      options.phase !== 'idle' ||
      prefersReducedMotion();

    if (skip) {
      applyPrimed(1, energyKnown ? target : ringRef.current);
      return;
    }

    if (modeRef.current === 'scale' && !introLaunchRef.current.scale) {
      introLaunchRef.current.scale = true;
      startScaleIntro();
      return;
    }

    if (modeRef.current === 'ring' && !introLaunchRef.current.ring) {
      introLaunchRef.current.ring = true;
      startRingCatchup();
    }
  }, [
    enabled,
    energyKnown,
    target,
    options.sendStarted,
    options.phase,
    applyPrimed,
    startScaleIntro,
    startRingCatchup,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (modeRef.current === 'primed' || isLobbyBootIntroPrimed()) return;
    if (!energyKnown) return;
    if (scaleRef.current < 0.999) return;
    if (ringRef.current >= target) {
      applyPrimed(1, target);
      return;
    }
    if (modeRef.current === 'idle' || modeRef.current === 'ring') {
      if (introLaunchRef.current.ring) return;
      introLaunchRef.current.ring = true;
      startRingCatchup();
    }
  }, [enabled, energyKnown, target, applyPrimed, startRingCatchup]);

  useEffect(
    () => () => {
      if (isLobbyBootIntroPrimed()) return;
      cancelAnim();
      snapshotLobbyBootIntroHandoff(scaleRef.current, ringRef.current);
    },
    [cancelAnim],
  );

  const isFilling =
    isAnimating &&
    energyKnown &&
    ringDisplayPercent < target &&
    !isLobbyBootIntroPrimed();

  return {
    orbScale: scale,
    ringDisplayPercent,
    isAnimating,
    isFilling,
    introPrimed: isLobbyBootIntroPrimed(),
  };
}
