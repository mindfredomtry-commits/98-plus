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
  introActive: boolean;
  onIntroEnd?: () => void;
  children: ReactNode;
};

/** Orb mount — boot scale on inner layer only. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    { className = '', style, introActive, onIntroEnd, children },
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
        if (event.animationName !== 'boot-orb-scale') return;
        if (introEndedRef.current) return;
        introEndedRef.current = true;
        onIntroEndRef.current?.();
      };

      root.addEventListener('animationend', handleAnimationEnd);
      return () => {
        root.removeEventListener('animationend', handleAnimationEnd);
      };
    }, [ref, introActive]);

    const rootClass = [
      className,
      introActive ? 'lobby-boot-intro-active' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={rootClass} style={style} data-orb-root>
        <div className="lobby-boot-orb-scale-layer" data-boot-scale-layer>
          {children}
        </div>
      </div>
    );
  },
);
