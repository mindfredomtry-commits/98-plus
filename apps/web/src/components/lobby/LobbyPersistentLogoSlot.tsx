'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isLobbyBootLogoIntroDone } from '@/lib/lobby-boot-intro-session';
import { logPersistentLogoComputedStyles } from '@/lib/lobby-logo-debug';
import { LobbyLaunchLogo } from '@/components/lobby/LobbyLaunchLogo';

type Props = {
  logoScaleActive: boolean;
  logoLocked: boolean;
  /** False only for confirm/compress — never during boot → lobby handoff. */
  visible?: boolean;
  onLogoScaleEnd?: () => void;
  logoScaleMs?: number;
  logoScaleDelayMs?: number;
  diagContext?: string;
};

/** Single 98+ overlay — stable scene anchor, scale intro on inner anchor only. */
export function LobbyPersistentLogoSlot({
  logoScaleActive,
  logoLocked,
  visible = true,
  onLogoScaleEnd,
  logoScaleMs = 400,
  logoScaleDelayMs = 0,
  diagContext = 'persistent',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const onLogoScaleEndRef = useRef(onLogoScaleEnd);
  const logoEndedRef = useRef(false);
  const [logoEnterDone, setLogoEnterDone] = useState(() => isLobbyBootLogoIntroDone());
  const [introAnimating, setIntroAnimating] = useState(false);
  onLogoScaleEndRef.current = onLogoScaleEnd;

  const logoEnterDoneVisible = logoEnterDone;
  const bootLogoPending =
    logoScaleActive && !introAnimating && !logoEnterDoneVisible;
  const runLogoIntro = introAnimating && !logoEnterDoneVisible;
  const logoSource = logoEnterDoneVisible ? 'persistent' : 'boot';

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.lobbyLogoLive = 'true';
  }, []);

  useLayoutEffect(() => {
    if (!logoScaleActive || logoEnterDone || logoLocked) {
      setIntroAnimating(false);
      if (!logoScaleActive) logoEndedRef.current = false;
      return;
    }

    let alive = true;
    const rafId = requestAnimationFrame(() => {
      if (alive) setIntroAnimating(true);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [logoScaleActive, logoEnterDone, logoLocked]);

  useEffect(() => {
    if (!runLogoIntro) return;

    const root = rootRef.current;
    if (!root) return;

    const finish = () => {
      if (logoEndedRef.current) return;
      logoEndedRef.current = true;
      setIntroAnimating(false);
      setLogoEnterDone(true);
      onLogoScaleEndRef.current?.();
    };

    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== anchorRef.current) return;
      if (event.animationName !== 'boot-logo-anchor-scale') return;
      finish();
    };

    const fallbackTimer = window.setTimeout(
      finish,
      logoScaleDelayMs + logoScaleMs + 30,
    );

    root.addEventListener('animationend', handleAnimationEnd);
    return () => {
      window.clearTimeout(fallbackTimer);
      root.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [runLogoIntro, logoScaleMs, logoScaleDelayMs]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const anchor = anchorRef.current;
    const title = titleRef.current;
    if (!root || !anchor || !title) return;

    root.style.transform = 'translate(-50%, -50%)';
    root.style.transition = 'none';
    root.style.animation = 'none';

    title.style.visibility = 'visible';
    title.style.transform = 'none';
    title.style.animation = 'none';
    title.style.transition = 'none';

    if (!logoEnterDoneVisible) {
      title.style.opacity = '';
      anchor.style.transform = '';
      anchor.style.opacity = '';
      anchor.style.animation = '';
      anchor.style.transition = '';
      return;
    }

    title.style.opacity = '1';

    anchor.style.transform = 'translate(-50%, -50%) scale(1)';
    anchor.style.opacity = '1';
    anchor.style.animation = 'none';
    anchor.style.transition = 'none';
  }, [logoEnterDoneVisible]);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const rows = logPersistentLogoComputedStyles(diagContext, rootRef.current);
    const anchorRow = rows.find((row) => row.label === 'anchor') ?? rows[0];
    if (!anchorRow) return;
    rootRef.current?.setAttribute('data-logo-transform', anchorRow.transform);
    rootRef.current?.setAttribute('data-logo-opacity', anchorRow.opacity);
  }, [diagContext, runLogoIntro, logoEnterDoneVisible, visible, introAnimating]);

  const hideForConfirm = !visible;
  const showHiddenClass = hideForConfirm;

  const rootClass = [
    'lobby-persistent-logo-slot',
    bootLogoPending ? 'lobby-boot-logo-pending' : '',
    runLogoIntro ? 'lobby-boot-logo-intro-active' : '',
    logoEnterDoneVisible ? 'lobby-boot-logo-ready lobby-boot-logo-enter-done' : '',
    showHiddenClass ? 'lobby-persistent-logo-slot--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={rootClass}
      data-lobby-persistent-logo
      data-logo-layer="persistent"
      data-logo-enter-done={logoEnterDoneVisible ? 'true' : undefined}
      data-logo-locked-visible={logoEnterDoneVisible ? 'true' : undefined}
      aria-hidden={showHiddenClass ? true : undefined}
    >
      <div ref={anchorRef} className="lobby-persistent-logo-anchor" data-logo-anchor>
        <LobbyLaunchLogo ref={titleRef} logoSource={logoSource} />
      </div>
    </div>
  );
}
