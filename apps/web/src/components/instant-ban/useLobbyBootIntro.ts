'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getLobbyBootIntroPrimedSnapshot,
  isLobbyBootIntroPrimed,
  LOBBY_BOOT_INTRO_SCALE_START,
  markLobbyBootIntroPrimed,
  shouldRunLobbyBootIntroVisualSync,
  snapshotLobbyBootIntroHandoff,
  takeLobbyBootIntroHandoff,
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
  if (options.enabled === false) return true;
  return (
    options.sendStarted ||
    options.phase !== 'idle' ||
    prefersReducedMotion()
  );
}

function resolveInitiallyPrimed(options: Options): boolean {
  if (shouldSkipBootIntro(options)) return true;
  return isLobbyBootIntroPrimed() || !shouldRunLobbyBootIntroVisualSync();
}

/**
 * Boot lobby intro — one CSS class, parallel scale + ring fill (550ms), no per-frame setState.
 */
export function useLobbyBootIntro(targetRingPercent: number, options: Options) {
  const target = clampPercent(targetRingPercent);
  const enabled = options.enabled !== false;
  const energyKnown = options.energyKnown;

  const initiallyPrimed = resolveInitiallyPrimed({ ...options, enabled });

  const [introPrimed, setIntroPrimed] = useState(initiallyPrimed);
  const ringRef = useRef(
    initiallyPrimed
      ? energyKnown
        ? target
        : getLobbyBootIntroPrimedSnapshot().ringPercent
      : 0,
  );

  const introActive =
    enabled && !introPrimed && shouldRunLobbyBootIntroVisualSync();

  useLayoutEffect(() => {
    takeLobbyBootIntroHandoff();
  }, []);

  const finishPrimed = useCallback(
    (ring: number) => {
      const clamped = clampPercent(ring);
      ringRef.current = clamped;
      setIntroPrimed(true);
      markLobbyBootIntroPrimed(clamped, 1);
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    if (shouldSkipBootIntro({ ...options, enabled })) {
      finishPrimed(energyKnown ? target : ringRef.current);
    }
  }, [
    enabled,
    energyKnown,
    target,
    options.sendStarted,
    options.phase,
    options.enabled,
    finishPrimed,
  ]);

  useEffect(
    () => () => {
      if (isLobbyBootIntroPrimed() || introPrimed) return;
      snapshotLobbyBootIntroHandoff(LOBBY_BOOT_INTRO_SCALE_START, ringRef.current);
    },
    [introPrimed],
  );

  const onIntroEnd = useCallback(() => {
    finishPrimed(energyKnown ? target : ringRef.current);
  }, [energyKnown, target, finishPrimed]);

  const ringDisplayPercent = introPrimed
    ? energyKnown
      ? target
      : getLobbyBootIntroPrimedSnapshot().ringPercent
    : energyKnown
      ? target
      : 0;

  const bootCssFillActive = introActive;

  return {
    ringDisplayPercent,
    ringTarget: target,
    introActive,
    introPrimed,
    bootCssFillActive,
    isFilling: bootCssFillActive,
    onIntroEnd,
  };
}
