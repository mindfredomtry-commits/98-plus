'use client';

import { useEffect, useRef } from 'react';
import { LobbyLaunchLogo } from '@/components/lobby/LobbyLaunchLogo';

type Props = {
  className?: string;
  logoScaleActive: boolean;
  logoLocked: boolean;
  onLogoScaleEnd?: () => void;
  logoScaleMs?: number;
};

/** Single 98+ logo layer — survives boot → lobby handoff without remount. */
export function LobbyPersistentLogoSlot({
  className = '',
  logoScaleActive,
  logoLocked,
  onLogoScaleEnd,
  logoScaleMs = 550,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onLogoScaleEndRef = useRef(onLogoScaleEnd);
  const logoEndedRef = useRef(false);
  onLogoScaleEndRef.current = onLogoScaleEnd;

  useEffect(() => {
    if (!logoScaleActive) {
      logoEndedRef.current = false;
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const finish = () => {
      if (logoEndedRef.current) return;
      logoEndedRef.current = true;
      onLogoScaleEndRef.current?.();
    };

    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName !== 'boot-logo-scale') return;
      finish();
    };

    const fallbackTimer = window.setTimeout(finish, logoScaleMs + 30);

    root.addEventListener('animationend', handleAnimationEnd);
    return () => {
      window.clearTimeout(fallbackTimer);
      root.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [logoScaleActive, logoScaleMs]);

  const rootClass = [
    'lobby-persistent-logo-slot',
    className,
    logoScaleActive ? 'lobby-boot-logo-intro-active' : '',
    logoLocked ? 'lobby-boot-logo-ready' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={rootClass} data-lobby-persistent-logo aria-hidden>
      <div className="lobby-boot-logo-layer" data-boot-logo-layer>
        <LobbyLaunchLogo />
      </div>
    </div>
  );
}
