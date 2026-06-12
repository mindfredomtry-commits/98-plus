'use client';

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { LOBBY_BOOT_INTRO_SCALE_START } from '@/lib/lobby-boot-intro-session';
import { patchLobbyBootIntroDebugGeometry } from '@/lib/lobby-boot-intro-debug';

type Props = {
  className?: string;
  style?: CSSProperties;
  bootIntroInitial: boolean;
  scalePending: boolean;
  scaleActive: boolean;
  scaleDone: boolean;
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
      bootIntroInitial,
      scalePending,
      scaleActive,
      scaleDone,
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

    const effectiveScalePending = bootIntroInitial && (scalePending || scaleActive);
    const effectiveScaleActive = bootIntroInitial && scaleActive;
    const effectiveScaleDone = bootIntroInitial && scaleDone;
    const effectiveRingBase = bootIntroInitial || ringBaseActive;
    const effectiveRingActive = bootIntroInitial && ringActive;

    const scaleLayerClass = [
      effectiveScalePending ? 'lobby-boot-intro-scale-pending' : '',
      effectiveScaleActive ? 'lobby-boot-intro-scale-active' : '',
      effectiveScaleDone ? 'lobby-boot-intro-scale-done' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const ringRootClass = [
      effectiveRingBase ? 'lobby-boot-intro-ring-base' : '',
      effectiveRingActive ? 'lobby-boot-intro-ring-active' : '',
      ringCatchupActive ? 'lobby-boot-intro-ring-catchup' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const scaleFactor = effectiveScaleDone
      ? 1
      : effectiveScalePending || effectiveScaleActive
        ? LOBBY_BOOT_INTRO_SCALE_START
        : undefined;

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
      bootIntroInitial,
      scalePending,
      scaleActive,
      scaleDone,
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

    const scaleLayerStyle = {
      ...(scaleFactor !== undefined
        ? ({ '--boot-orb-scale-factor': scaleFactor } as CSSProperties)
        : {}),
    } as CSSProperties;

    return (
      <div
        ref={ref}
        className={`${className}${ringRootClass ? ` ${ringRootClass}` : ''}${
          bootIntroInitial ? ' lobby-boot-intro-orb-root' : ''
        }`}
        style={mergedStyle}
        data-orb-root
        data-boot-intro-initial={bootIntroInitial ? '' : undefined}
      >
        <div
          ref={scaleLayerRef}
          className={`lobby-boot-orb-scale-layer${
            scaleLayerClass ? ` ${scaleLayerClass}` : ''
          }`}
          style={scaleLayerStyle}
          data-boot-scale-layer
        >
          {children}
        </div>
      </div>
    );
  },
);
