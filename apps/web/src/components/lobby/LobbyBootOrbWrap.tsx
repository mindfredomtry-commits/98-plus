'use client';

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { patchLobbyBootIntroDebugGeometry } from '@/lib/lobby-boot-intro-debug';

type Props = {
  className?: string;
  style?: CSSProperties;
  scalePending: boolean;
  scaleActive: boolean;
  ringBaseActive: boolean;
  ringActive: boolean;
  ringCatchupActive: boolean;
  ringTarget: number;
  onScaleAnimationEnd?: () => void;
  onRingAnimationEnd?: () => void;
  children: ReactNode;
};

function readTransform(el: Element | null): string {
  if (!el || typeof window === 'undefined') return '—';
  const value = window.getComputedStyle(el).transform;
  return value && value !== 'none' ? value : 'none';
}

function readBox(el: Element | null): string {
  if (!el || typeof window === 'undefined') return '—';
  const rect = el.getBoundingClientRect();
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

/** Orb mount — positioning on root, boot scale on inner layer, ring fill on root. */
export const LobbyBootOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyBootOrbWrap(
    {
      className = '',
      style,
      scalePending,
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
    const scaleLayerRef = useRef<HTMLDivElement>(null);
    const onScaleRef = useRef(onScaleAnimationEnd);
    const onRingRef = useRef(onRingAnimationEnd);
    onScaleRef.current = onScaleAnimationEnd;
    onRingRef.current = onRingAnimationEnd;

    const scaleLayerClass = [
      scalePending ? 'lobby-boot-intro-scale-pending' : '',
      scaleActive ? 'lobby-boot-intro-scale-active' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const ringRootClass = [
      ringBaseActive ? 'lobby-boot-intro-ring-base' : '',
      ringActive ? 'lobby-boot-intro-ring-active' : '',
      ringCatchupActive ? 'lobby-boot-intro-ring-catchup' : '',
    ]
      .filter(Boolean)
      .join(' ');

    useLayoutEffect(() => {
      const root =
        ref && typeof ref === 'object' && 'current' in ref ? ref.current : null;
      const scaleLayer = scaleLayerRef.current;
      const ringSvg = root?.querySelector('.influence-ring');
      const ringLayer = root?.querySelector('.instant-ban-arena-lobby-orb__ring-layer');

      patchLobbyBootIntroDebugGeometry({
        ringBox: readBox(ringSvg),
        scaleLayerTransform: readTransform(scaleLayer),
        ringTransform: readTransform(ringLayer),
        wrapperTransform: readTransform(root),
        scaleLayerClass: scaleLayerClass || '—',
        ringRootClass: ringRootClass || '—',
      });
    }, [
      ref,
      scaleLayerClass,
      ringRootClass,
      scalePending,
      scaleActive,
      ringBaseActive,
      ringActive,
      ringCatchupActive,
    ]);

    useEffect(() => {
      const root =
        ref && typeof ref === 'object' && 'current' in ref ? ref.current : null;
      if (!root) return;

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

      root.addEventListener('animationend', onAnimEnd);
      root.addEventListener('transitionend', onTransitionEnd);
      return () => {
        root.removeEventListener('animationend', onAnimEnd);
        root.removeEventListener('transitionend', onTransitionEnd);
      };
    }, [ref, ringCatchupActive]);

    const mergedStyle = {
      ...style,
      '--boot-ring-target-progress': ringTarget,
    } as CSSProperties;

    return (
      <div
        ref={ref}
        className={`${className}${ringRootClass ? ` ${ringRootClass}` : ''}`}
        style={mergedStyle}
        data-orb-root
      >
        <div
          ref={scaleLayerRef}
          className={`lobby-boot-orb-scale-layer${
            scaleLayerClass ? ` ${scaleLayerClass}` : ''
          }`}
          data-boot-scale-layer
        >
          {children}
        </div>
      </div>
    );
  },
);
