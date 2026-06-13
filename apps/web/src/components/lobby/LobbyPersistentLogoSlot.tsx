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
  diagContext?: string;
};

/** Single 98+ overlay — stable scene anchor, scale intro on inner anchor only. */
export function LobbyPersistentLogoSlot({
  logoScaleActive,
  logoLocked,
  visible = true,
  onLogoScaleEnd,
  logoScaleMs = 550,
  diagContext = 'persistent',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const onLogoScaleEndRef = useRef(onLogoScaleEnd);
  const logoEndedRef = useRef(false);
  const [logoEnterDone, setLogoEnterDone] = useState(() => isLobbyBootLogoIntroDone());
  onLogoScaleEndRef.current = onLogoScaleEnd;

  const logoLockedVisible = logoEnterDone || logoLocked;
  const runLogoIntro = logoScaleActive && !logoLockedVisible;
  const bootLogoPending = !logoLockedVisible;
  const logoSource = logoLockedVisible ? 'persistent' : 'boot';

  useEffect(() => {
    if (!runLogoIntro) {
      if (!logoScaleActive) logoEndedRef.current = false;
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const finish = () => {
      if (logoEndedRef.current) return;
      logoEndedRef.current = true;
      setLogoEnterDone(true);
      onLogoScaleEndRef.current?.();
    };

    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== anchorRef.current) return;
      if (event.animationName !== 'boot-logo-anchor-scale') return;
      finish();
    };

    const fallbackTimer = window.setTimeout(finish, logoScaleMs + 30);

    root.addEventListener('animationend', handleAnimationEnd);
    return () => {
      window.clearTimeout(fallbackTimer);
      root.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [runLogoIntro, logoScaleActive, logoScaleMs]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const anchor = anchorRef.current;
    const title = titleRef.current;
    if (!root || !anchor || !title) return;

    root.style.transform = 'translate(-50%, -50%)';
    root.style.transition = 'none';
    root.style.animation = 'none';

    if (!logoLockedVisible) {
      anchor.style.removeProperty('transform');
      anchor.style.removeProperty('animation');
      anchor.style.removeProperty('transition');
      title.style.opacity = '1';
      title.style.visibility = 'visible';
      title.style.transform = 'none';
      title.style.animation = 'none';
      title.style.transition = 'none';
      return;
    }

    anchor.style.transform = 'translate(-50%, -50%) scale(1)';
    anchor.style.animation = 'none';
    anchor.style.transition = 'none';
    title.style.opacity = '1';
    title.style.visibility = 'visible';
    title.style.transform = 'none';
    title.style.animation = 'none';
    title.style.transition = 'none';
  }, [logoLockedVisible]);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const rows = logPersistentLogoComputedStyles(diagContext, rootRef.current);
    const anchorRow = rows.find((row) => row.label === 'anchor') ?? rows[0];
    if (!anchorRow) return;
    rootRef.current?.setAttribute('data-logo-transform', anchorRow.transform);
    rootRef.current?.setAttribute('data-logo-opacity', anchorRow.opacity);
  }, [diagContext, runLogoIntro, logoLockedVisible, visible]);

  const hideForConfirm = !visible;
  const showHiddenClass = hideForConfirm;

  const rootClass = [
    'lobby-persistent-logo-slot',
    bootLogoPending ? 'lobby-boot-logo-pending' : '',
    runLogoIntro ? 'lobby-boot-logo-intro-active' : '',
    logoLockedVisible ? 'lobby-boot-logo-ready lobby-boot-logo-enter-done' : '',
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
      data-logo-enter-done={logoLockedVisible ? 'true' : undefined}
      data-logo-locked-visible={logoLockedVisible ? 'true' : undefined}
      aria-hidden={showHiddenClass ? true : undefined}
    >
      <div ref={anchorRef} className="lobby-persistent-logo-anchor" data-logo-anchor>
        <LobbyLaunchLogo ref={titleRef} logoSource={logoSource} />
      </div>
    </div>
  );
}
