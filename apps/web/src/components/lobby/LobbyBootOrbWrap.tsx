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
  ringScaleActive: boolean;
  fillActive: boolean;
  ringScaleLocked: boolean;
  ringTarget: number;
  onRingScaleEnd?: () => void;
  onFillEnd?: () => void;
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

/** Boot launch ring shell — logo lives in LobbyPersistentLogoSlot. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    {
      className = '',
      style,
      ringScaleActive,
      fillActive,
      ringScaleLocked,
      ringTarget,
      onRingScaleEnd,
      onFillEnd,
      ringScaleMs = 550,
      fillMs = 550,
      children,
      ...rest
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const onRingScaleEndRef = useRef(onRingScaleEnd);
    const onFillEndRef = useRef(onFillEnd);
    const ringEndedRef = useRef(false);
    const fillEndedRef = useRef(false);
    onRingScaleEndRef.current = onRingScaleEnd;
    onFillEndRef.current = onFillEnd;

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
        <div className="lobby-boot-ring-shell" data-boot-ring-shell>
          <div className="lobby-boot-orb-scale-layer" data-boot-scale-layer>
            {children}
          </div>
        </div>
      </div>
    );
  },
);
