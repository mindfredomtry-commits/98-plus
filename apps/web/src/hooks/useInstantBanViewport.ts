'use client';

import { useEffect, useRef } from 'react';
import {
  instantBanDebug,
  isInstantBanLiteMode,
  logInstantBanViewport,
} from '@/lib/instant-ban-debug';

const HEIGHT_VARS = [
  '--instant-ban-vh',
  '--app-stable-height',
  '--instant-ban-viewport-h',
] as const;

const RESUME_CLASS = 'instant-ban-resuming';
const RESUME_SETTLE_MS = 120;
const RESUME_REMEASURE_MS = 100;
/** Reject one-frame height glitches during resume (e.g. ~half viewport). */
const RESUME_SUSPICIOUS_LOW_RATIO = 0.78;
const RESUME_SUSPICIOUS_HIGH_RATIO = 1.28;

function measureViewportHeight(): number {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  return Math.max(1, Math.round(h));
}

function isSuspiciousResumeHeight(
  candidate: number,
  stable: number | null,
): boolean {
  if (stable == null || stable <= 0) return false;
  const ratio = candidate / stable;
  return (
    ratio < RESUME_SUSPICIOUS_LOW_RATIO || ratio > RESUME_SUSPICIOUS_HIGH_RATIO
  );
}

function setStableHeightVars(root: HTMLElement, heightPx: number): void {
  const value = `${heightPx}px`;
  for (const name of HEIGHT_VARS) {
    root.style.setProperty(name, value);
  }
}

function clearStableHeightVars(root: HTMLElement): void {
  for (const name of HEIGHT_VARS) {
    root.style.removeProperty(name);
  }
}

/** Stabilize InstantBanFlow height (keyboard + Telegram resume). */
export function useInstantBanViewport(active: boolean): void {
  const countsRef = useRef({ resizeCount: 0, vvResizeCount: 0 });
  const stableHeightRef = useRef<number | null>(null);
  const wasHiddenRef = useRef(false);
  const resumingRef = useRef(false);
  const resumeGenRef = useRef(0);
  const resumeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRemeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const root = document.documentElement;

    const clearResumeTimers = () => {
      if (resumeClearTimerRef.current != null) {
        clearTimeout(resumeClearTimerRef.current);
        resumeClearTimerRef.current = null;
      }
      if (resumeRemeasureTimerRef.current != null) {
        clearTimeout(resumeRemeasureTimerRef.current);
        resumeRemeasureTimerRef.current = null;
      }
    };

    const endResume = (gen: number) => {
      if (gen !== resumeGenRef.current) return;
      resumingRef.current = false;
      root.classList.remove(RESUME_CLASS);
      resumeClearTimerRef.current = null;
    };

    const applyHeight = (source: string, opts?: { force?: boolean }) => {
      const measured = measureViewportHeight();
      const stable = stableHeightRef.current;

      if (
        resumingRef.current &&
        !opts?.force &&
        stable != null &&
        isSuspiciousResumeHeight(measured, stable)
      ) {
        if (process.env.NODE_ENV === 'development') {
          instantBanDebug('viewport-skip-suspicious', {
            source,
            measured,
            stable,
          });
        }
        return;
      }

      stableHeightRef.current = measured;
      setStableHeightVars(root, measured);

      if (process.env.NODE_ENV === 'development') {
        logInstantBanViewport(source, countsRef.current);
      }
    };

    const scheduleResumeRecheck = (source: string) => {
      const gen = ++resumeGenRef.current;
      resumingRef.current = true;
      root.classList.add(RESUME_CLASS);
      clearResumeTimers();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== resumeGenRef.current) return;
          applyHeight(`${source}:raf2`);

          resumeRemeasureTimerRef.current = setTimeout(() => {
            resumeRemeasureTimerRef.current = null;
            if (gen !== resumeGenRef.current) return;
            applyHeight(`${source}:delayed`, { force: true });

            resumeClearTimerRef.current = setTimeout(() => {
              endResume(gen);
            }, RESUME_SETTLE_MS);
          }, RESUME_REMEASURE_MS);
        });
      });
    };

    const onWindowResize = () => {
      countsRef.current.resizeCount += 1;
      applyHeight('window.resize');
    };

    const onVvResize = () => {
      countsRef.current.vvResizeCount += 1;
      applyHeight('visualViewport.resize');
    };

    const onVvScroll = () => {
      if (resumingRef.current) return;
      applyHeight('visualViewport.scroll');
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === 'visible' && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        scheduleResumeRecheck('visibilitychange');
      }
    };

    const onWindowFocus = () => {
      if (!wasHiddenRef.current) return;
      wasHiddenRef.current = false;
      scheduleResumeRecheck('focus');
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        scheduleResumeRecheck('pageshow');
      }
    };

    const onOrientationChange = () => {
      scheduleResumeRecheck('orientationchange');
    };

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('orientationchange', onOrientationChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', onVvResize);
    vv?.addEventListener('scroll', onVvScroll);

    const tg = window.Telegram?.WebApp as
      | { onEvent?: (event: string, cb: () => void) => void }
      | undefined;
    const onTgViewport = () => applyHeight('telegram.viewportChanged');
    tg?.onEvent?.('viewportChanged', onTgViewport);

    applyHeight('mount');

    return () => {
      clearResumeTimers();
      resumeGenRef.current += 1;
      resumingRef.current = false;
      root.classList.remove(RESUME_CLASS);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('orientationchange', onOrientationChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      vv?.removeEventListener('resize', onVvResize);
      vv?.removeEventListener('scroll', onVvScroll);
      clearStableHeightVars(root);
      stableHeightRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !isInstantBanLiteMode()) return;
    instantBanDebug('lite-mode', { enabled: true });
  }, [active]);
}
