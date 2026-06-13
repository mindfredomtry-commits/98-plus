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

const BOOT_INTRO_MS = 580;

type Props = {
  className?: string;
  style?: CSSProperties;
  introActive: boolean;
  ringTarget: number;
  onIntroEnd?: () => void;
  children: ReactNode;
} & Record<string, unknown>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref && typeof ref === 'object') {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

/** Boot scene orb — scale + ring fill via CSS only. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    { className = '', style, introActive, ringTarget, onIntroEnd, children, ...rest },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const onIntroEndRef = useRef(onIntroEnd);
    const introEndedRef = useRef(false);
    onIntroEndRef.current = onIntroEnd;

    useEffect(() => {
      if (!introActive) {
        introEndedRef.current = false;
        return;
      }

      const root = rootRef.current;
      if (!root) return;

      const finish = () => {
        if (introEndedRef.current) return;
        introEndedRef.current = true;
        onIntroEndRef.current?.();
      };

      const handleAnimationEnd = (event: AnimationEvent) => {
        const name = event.animationName;
        if (name !== 'boot-orb-scale' && name !== 'boot-ring-fill') return;
        finish();
      };

      const fallbackTimer = window.setTimeout(finish, BOOT_INTRO_MS);

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        window.clearTimeout(fallbackTimer);
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [introActive]);

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
      introActive ? 'lobby-boot-intro-active' : '',
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
