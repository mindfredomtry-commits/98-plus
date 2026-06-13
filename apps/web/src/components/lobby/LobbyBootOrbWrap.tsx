'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react';
import { INFLUENCE_RING_CIRCUMFERENCE } from '@/components/lobby/InfluenceRing';
import { LobbyLaunchLogo } from '@/components/lobby/LobbyLaunchLogo';

type Props = {
  className?: string;
  style?: CSSProperties;
  logoScaleActive: boolean;
  ringScaleActive: boolean;
  fillActive: boolean;
  logoLocked: boolean;
  ringScaleLocked: boolean;
  ringTarget: number;
  onLogoScaleEnd?: () => void;
  onRingScaleEnd?: () => void;
  onFillEnd?: () => void;
  logoScaleMs?: number;
  ringScaleMs?: number;
  fillMs?: number;
  children: ReactNode;
} & Record<string, unknown>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object') {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

/** Boot launch orb — logo scale, then ring scale, then energy fill (CSS only). */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    {
      className = '',
      style,
      logoScaleActive,
      ringScaleActive,
      fillActive,
      logoLocked,
      ringScaleLocked,
      ringTarget,
      onLogoScaleEnd,
      onRingScaleEnd,
      onFillEnd,
      logoScaleMs = 550,
      ringScaleMs = 550,
      fillMs = 550,
      children,
      ...rest
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const onLogoScaleEndRef = useRef(onLogoScaleEnd);
    const onRingScaleEndRef = useRef(onRingScaleEnd);
    const onFillEndRef = useRef(onFillEnd);
    const logoEndedRef = useRef(false);
    const ringEndedRef = useRef(false);
    const fillEndedRef = useRef(false);
    onLogoScaleEndRef.current = onLogoScaleEnd;
    onRingScaleEndRef.current = onRingScaleEnd;
    onFillEndRef.current = onFillEnd;

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

    useEffect(() => {
      if (!ringScaleActive) {
        ringEndedRef.current = false;
        return;
      }

      const root = rootRef.current;
      if (!root) return;

      const finish = () => {
        if (ringEndedRef.current) return;
        ringEndedRef.current = true;
        onRingScaleEndRef.current?.();
      };

      const handleAnimationEnd = (event: AnimationEvent) => {
        if (event.animationName !== 'boot-orb-scale') return;
        finish();
      };

      const fallbackTimer = window.setTimeout(finish, ringScaleMs + 30);

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        window.clearTimeout(fallbackTimer);
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [ringScaleActive, ringScaleMs]);

    useEffect(() => {
      if (!fillActive) {
        fillEndedRef.current = false;
        return;
      }

      const root = rootRef.current;
      if (!root) return;

      const finish = () => {
        if (fillEndedRef.current) return;
        fillEndedRef.current = true;
        onFillEndRef.current?.();
      };

      const handleAnimationEnd = (event: AnimationEvent) => {
        if (event.animationName !== 'boot-ring-fill') return;
        finish();
      };

      const fallbackTimer = window.setTimeout(finish, fillMs + 30);

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        window.clearTimeout(fallbackTimer);
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [fillActive, fillMs]);

    const targetRatio = Math.min(1, Math.max(0, ringTarget / 100));
    const circ = INFLUENCE_RING_CIRCUMFERENCE;

    const mergedStyle = {
      ...style,
      '--ring-circumference': circ,
      '--boot-ring-target-dashoffset': circ * (1 - targetRatio),
      '--boot-ring-target-ratio': targetRatio,
    } as CSSProperties;

    const rootClass = [
      className,
      'lobby-boot-orb-root',
      logoScaleActive ? 'lobby-boot-logo-intro-active' : '',
      logoLocked ? 'lobby-boot-logo-ready' : '',
      ringScaleActive ? 'lobby-boot-intro-active' : '',
      ringScaleLocked ? 'lobby-boot-scale-done' : '',
      fillActive ? 'lobby-boot-fill-active' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={(node) => {
          rootRef.current = node;
          assignRef(ref, node);
        }}
        className={rootClass}
        style={mergedStyle}
        data-orb-root
        {...rest}
      >
        <div className="lobby-boot-logo-layer" data-boot-logo-layer>
          <LobbyLaunchLogo />
        </div>
        <div className="lobby-boot-ring-shell" data-boot-ring-shell>
          <div className="lobby-boot-orb-scale-layer" data-boot-scale-layer>
            {children}
          </div>
        </div>
      </div>
    );
  },
);
