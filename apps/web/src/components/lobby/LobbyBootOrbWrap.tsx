'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

type Props = {
  className?: string;
  style?: CSSProperties;
  scaleActive: boolean;
  ringBaseActive: boolean;
  ringActive: boolean;
  ringCatchupActive: boolean;
  ringTarget: number;
  onScaleAnimationEnd?: () => void;
  onRingAnimationEnd?: () => void;
  children: ReactNode;
};

/** Orb mount with CSS animationend hooks — no per-frame React updates. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    {
      className = '',
      style,
      scaleActive,
      ringBaseActive,
      ringActive,
      ringCatchupActive,
      ringTarget,
      onScaleAnimationEnd,
      onRingAnimationEnd,
      children,
    },
    ref,
  ) {
    const onScaleRef = useRef(onScaleAnimationEnd);
    const onRingRef = useRef(onRingAnimationEnd);
    onScaleRef.current = onScaleAnimationEnd;
    onRingRef.current = onRingAnimationEnd;

    useEffect(() => {
      const el =
        ref && typeof ref === 'object' && 'current' in ref ? ref.current : null;
      if (!el) return;

      const onAnimEnd = (event: AnimationEvent) => {
        const name = event.animationName;
        if (name === 'lobby-boot-scale-in') {
          onScaleRef.current?.();
        }
        if (name === 'lobby-boot-ring-fill') {
          onRingRef.current?.();
        }
      };

      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'stroke-dashoffset') return;
        if (!ringCatchupActive) return;
        onRingRef.current?.();
      };

      el.addEventListener('animationend', onAnimEnd);
      el.addEventListener('transitionend', onTransitionEnd);
      return () => {
        el.removeEventListener('animationend', onAnimEnd);
        el.removeEventListener('transitionend', onTransitionEnd);
      };
    }, [ref, ringCatchupActive]);

    const mergedStyle = {
      ...style,
      '--boot-ring-target-progress': ringTarget,
    } as CSSProperties;

    const introClass = [
      scaleActive ? 'lobby-boot-intro-scale-active' : '',
      ringBaseActive ? 'lobby-boot-intro-ring-base' : '',
      ringActive ? 'lobby-boot-intro-ring-active' : '',
      ringCatchupActive ? 'lobby-boot-intro-ring-catchup' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={`${className}${introClass ? ` ${introClass}` : ''}`}
        style={mergedStyle}
        data-orb-root
      >
        {children}
      </div>
    );
  },
);
