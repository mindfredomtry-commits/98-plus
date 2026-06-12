'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { INFLUENCE_RING_CIRCUMFERENCE } from '@/components/lobby/InfluenceRing';

type Props = {
  className?: string;
  style?: CSSProperties;
  introActive: boolean;
  ringTarget: number;
  onIntroEnd?: () => void;
  children: ReactNode;
};

/** Orb mount — boot scale on inner layer, ring fill via root intro class. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    { className = '', style, introActive, ringTarget, onIntroEnd, children },
    ref,
  ) {
    const onIntroEndRef = useRef(onIntroEnd);
    const introEndedRef = useRef(false);
    onIntroEndRef.current = onIntroEnd;

    useEffect(() => {
      if (!introActive) {
        introEndedRef.current = false;
        return;
      }

      const root =
        ref && typeof ref === 'object' && 'current' in ref ? ref.current : null;
      if (!root) return;

      const handleAnimationEnd = (event: AnimationEvent) => {
        const name = event.animationName;
        if (name !== 'boot-orb-scale' && name !== 'boot-ring-fill') return;
        if (introEndedRef.current) return;
        introEndedRef.current = true;
        onIntroEndRef.current?.();
      };

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [ref, introActive]);

    const targetRatio = Math.min(1, Math.max(0, ringTarget / 100));
    const circ = INFLUENCE_RING_CIRCUMFERENCE;

    const mergedStyle = {
      ...style,
      '--circ': circ,
      '--target-dash': circ * (1 - targetRatio),
      '--boot-ring-target-ratio': targetRatio,
    } as CSSProperties;

    const rootClass = [
      className,
      introActive ? 'lobby-boot-intro-active' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={rootClass} style={mergedStyle} data-orb-root>
        <div className="lobby-boot-orb-scale-layer" data-boot-scale-layer>
          {children}
        </div>
      </div>
    );
  },
);
