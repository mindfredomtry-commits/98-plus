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
import { INFLUENCE_RING_CIRCUMFERENCE } from '@/components/lobby/InfluenceRing';
import { patchLobbyBootIntroDebugGeometry } from '@/lib/lobby-boot-intro-debug';

type Props = {
  className?: string;
  style?: CSSProperties;
  bootIntroActive: boolean;
  introPrimed: boolean;
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
      bootIntroActive,
      introPrimed,
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

    const effectiveScalePending = bootIntroActive && (scalePending || scaleActive);
    const effectiveScaleActive = bootIntroActive && scaleActive;
    const effectiveScaleDone = bootIntroActive && scaleDone;
    const effectiveRingBase = bootIntroActive && ringBaseActive;
    const effectiveRingActive = bootIntroActive && ringActive;

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

    const scaleFactor =
      introPrimed || !bootIntroActive
        ? undefined
        : effectiveScaleDone
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
      const progressEl = root?.querySelector(
        '.influence-ring__progress',
      ) as SVGCircleElement | null;

      const targetRatio = Math.min(1, Math.max(0, ringTarget / 100));
      const circ = INFLUENCE_RING_CIRCUMFERENCE;
      const initialDash = circ;
      const targetDash = circ * (1 - targetRatio);
      let currentDash = '—';
      let progressVisible = false;
      if (progressEl && typeof window !== 'undefined') {
        const computed = window.getComputedStyle(progressEl);
        currentDash = computed.strokeDashoffset || '—';
        const dashOff = parseFloat(computed.strokeDashoffset);
        progressVisible =
          Number.isFinite(dashOff) && dashOff < circ - 0.5;
      }

      patchLobbyBootIntroDebugGeometry({
        ringBox: readBox(ringSvg),
        scaleLayerTransform: readTransform(scaleLayer),
        ringTransform: readTransform(ringLayer),
        wrapperTransform: readTransform(root),
        scaleLayerClass: scaleLayerClass || '—',
        ringRootClass: introPrimed
          ? 'lobby-boot-intro-primed'
          : ringRootClass || '—',
        currentDashoffset: currentDash,
        progressStrokeVisible: progressVisible,
      });
    }, [
      ref,
      scaleLayerClass,
      ringRootClass,
      bootIntroActive,
      introPrimed,
      scalePending,
      scaleActive,
      scaleDone,
      ringBaseActive,
      ringActive,
      ringCatchupActive,
      ringTarget,
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

    const targetRatio = Math.min(1, Math.max(0, ringTarget / 100));

    const mergedStyle = {
      ...style,
      '--boot-ring-target-ratio': targetRatio,
    } as CSSProperties;

    const scaleLayerStyle = {
      ...(scaleFactor !== undefined
        ? ({ '--boot-orb-scale-factor': scaleFactor } as CSSProperties)
        : {}),
    } as CSSProperties;

    const rootClass = [
      className,
      ringRootClass,
      introPrimed ? 'lobby-boot-intro-primed lobby-orb-normal-visible' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={rootClass}
        style={mergedStyle}
        data-orb-root
        data-boot-intro-active={bootIntroActive ? '' : undefined}
        data-boot-intro-primed={introPrimed ? '' : undefined}
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
