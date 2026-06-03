'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type LobbyPhase = 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';

const LOBBY_RING_INTRO_MS = 900;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type Options = {
  phase: SendFlowPhase;
  /** Skip intro when flow opens past lobby (e.g. send already started). */
  sendStarted: boolean;
};

/**
 * One-time lobby ring fill 0 → actual on cold open. Does not re-run on Who→Lobby return.
 */
export function useLobbyRingIntroFill(actualPercent: number, options: Options) {
  const introDoneRef = useRef(false);
  const introStartedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const [displayPercent, setDisplayPercent] = useState(() =>
    introDoneRef.current ? clampPercent(actualPercent) : 0,
  );
  const [isFilling, setIsFilling] = useState(false);

  const cancelAnim = useCallback(() => {
    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const finishIntro = useCallback(
    (value: number) => {
      cancelAnim();
      setIsFilling(false);
      setDisplayPercent(clampPercent(value));
      introDoneRef.current = true;
    },
    [cancelAnim],
  );

  const runIntroFill = useCallback(
    (target: number) => {
      cancelAnim();
      const clampedTarget = clampPercent(target);
      setIsFilling(true);
      setDisplayPercent(0);
      const startTime = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / LOBBY_RING_INTRO_MS);
        const eased = easeOutCubic(t);
        setDisplayPercent(clampedTarget * eased);
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        finishIntro(clampedTarget);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    },
    [cancelAnim, finishIntro],
  );

  useEffect(() => {
    if (introDoneRef.current) {
      setDisplayPercent(clampPercent(actualPercent));
      return;
    }

    if (options.phase !== 'idle') {
      cancelAnim();
      introStartedRef.current = true;
      finishIntro(actualPercent);
      return;
    }

    if (introStartedRef.current) return;

    const skipIntro = options.sendStarted || prefersReducedMotion();

    if (skipIntro) {
      finishIntro(actualPercent);
      return;
    }

    introStartedRef.current = true;
    runIntroFill(actualPercent);
  }, [
    actualPercent,
    cancelAnim,
    finishIntro,
    options.phase,
    options.sendStarted,
    runIntroFill,
  ]);

  useEffect(() => () => cancelAnim(), [cancelAnim]);

  return { displayPercent, isFilling };
}
