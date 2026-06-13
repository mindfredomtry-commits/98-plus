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

type Props = {
  className?: string;
  style?: CSSProperties;
  scaleActive: boolean;
  fillActive: boolean;
  scaleLocked: boolean;
  ringTarget: number;
  onScaleEnd?: () => void;
  onFillEnd?: () => void;
  scaleMs?: number;
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

/** Boot launch orb — scale (orbEnter) then ring fill (energyFill), CSS only. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    {
      className = '',
      style,
      scaleActive,
      fillActive,
      scaleLocked,
      ringTarget,
      onScaleEnd,
      onFillEnd,
      scaleMs = 550,
      fillMs = 550,
      children,
      ...rest
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const onScaleEndRef = useRef(onScaleEnd);
    const onFillEndRef = useRef(onFillEnd);
    const scaleEndedRef = useRef(false);
    const fillEndedRef = useRef(false);
    onScaleEndRef.current = onScaleEnd;
    onFillEndRef.current = onFillEnd;

    useEffect(() => {
      if (!scaleActive) {
        scaleEndedRef.current = false;
        return;
      }

      const root = rootRef.current;
      if (!root) return;

      const finish = () => {
        if (scaleEndedRef.current) return;
        scaleEndedRef.current = true;
        onScaleEndRef.current?.();
      };

      const handleAnimationEnd = (event: AnimationEvent) => {
        if (event.animationName !== 'boot-orb-scale') return;
        finish();
      };

      const fallbackTimer = window.setTimeout(finish, scaleMs + 30);

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        window.clearTimeout(fallbackTimer);
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [scaleActive, scaleMs]);

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
      scaleActive ? 'lobby-boot-intro-active' : '',
      scaleLocked ? 'lobby-boot-scale-done' : '',
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
        <div className="lobby-boot-orb-scale-layer" data-boot-scale-layer>
          {children}
        </div>
      </div>
    );
  },
);
