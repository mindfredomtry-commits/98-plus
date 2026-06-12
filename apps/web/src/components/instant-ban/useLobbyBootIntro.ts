'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  hasPlayedLobbyBootIntroThisSession,
  isLobbyBootIntroPrimed,
  markLobbyBootIntroPrimed,
  shouldRunLobbyBootIntroVisualSync,
} from '@/lib/lobby-boot-intro-session';

type LobbyPhase = 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';

type Options = {
  phase: LobbyPhase;
  sendStarted: boolean;
  energyKnown: boolean;
  enabled?: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function shouldSkipBootIntro(options: Options): boolean {
  return (
    options.sendStarted ||
    options.phase !== 'idle' ||
    prefersReducedMotion()
  );
}

function resolveInitialIntroPrimed(options: Options): boolean {
  if (hasPlayedLobbyBootIntroThisSession()) return true;
  return shouldSkipBootIntro(options);
}

/** Boot lobby intro — scale only (550ms), once per session. */
export function useLobbyBootIntro(targetRingPercent: number, options: Options) {
  const target = clampPercent(targetRingPercent);
  const enabled = options.enabled !== false;
  const energyKnown = options.energyKnown;

  const [introPrimed, setIntroPrimed] = useState(() =>
    resolveInitialIntroPrimed(options),
  );
  const ringRef = useRef(
    introPrimed
      ? energyKnown
        ? target
        : getLobbyBootIntroPrimedSnapshot().ringPercent
      : 0,
  );

  const introActive =
    enabled &&
    !introPrimed &&
    shouldRunLobbyBootIntroVisualSync() &&
    !shouldSkipBootIntro(options);

  const finishPrimed = useCallback(
    (ring: number) => {
      const clamped = clampPercent(ring);
      ringRef.current = clamped;
      setIntroPrimed(true);
      markLobbyBootIntroPrimed(clamped, 1);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!shouldSkipBootIntro(options) || isLobbyBootIntroPrimed()) return;
    finishPrimed(energyKnown ? target : ringRef.current);
  }, [energyKnown, target, finishPrimed, options.sendStarted, options.phase]);

  useLayoutEffect(() => {
    if (!isLobbyBootIntroPrimed() || introPrimed) return;
    const snap = getLobbyBootIntroPrimedSnapshot();
    ringRef.current = energyKnown ? target : snap.ringPercent;
    setIntroPrimed(true);
  }, [introPrimed, energyKnown, target]);

  useEffect(() => {
    if (shouldSkipBootIntro(options) && !isLobbyBootIntroPrimed()) {
      finishPrimed(energyKnown ? target : ringRef.current);
      return;
    }
    if (!enabled) return;
    if (isLobbyBootIntroPrimed() && !introPrimed) {
      finishPrimed(energyKnown ? target : getLobbyBootIntroPrimedSnapshot().ringPercent);
    }
  }, [
    enabled,
    energyKnown,
    target,
    options.sendStarted,
    options.phase,
    introPrimed,
    finishPrimed,
  ]);

  const onIntroEnd = useCallback(() => {
    finishPrimed(energyKnown ? target : ringRef.current);
  }, [energyKnown, target, finishPrimed]);

  const ringDisplayPercent = introPrimed
    ? energyKnown
      ? target
      : getLobbyBootIntroPrimedSnapshot().ringPercent
    : 0;

  return {
    ringDisplayPercent,
    introActive,
    introPrimed,
    skipIntro: introPrimed || hasPlayedLobbyBootIntroThisSession(),
    onIntroEnd,
  };
}
