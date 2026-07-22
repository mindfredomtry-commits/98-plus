'use client';

import {
  dualSegmentArcDegrees,
  VIEWER_ARC_ANCHOR_DEG,
  OTHER_ARC_ANCHOR_DEG,
} from '@/components/monetization/RelationshipOrb';
import {
  RELATIONSHIP_METRIC_COLORS,
  RELATIONSHIP_ORB_TRACK,
} from '@/components/monetization/relationship-metric-colors';

/** Shared with analytics RelationshipOrb OUTER ring. */
export const RELATIONSHIP_RING_SIZE = 280;
export const RELATIONSHIP_RING_STROKE = 10;
export const RELATIONSHIP_RING_RADIUS = 118;

const CX = RELATIONSHIP_RING_SIZE / 2;
const CY = RELATIONSHIP_RING_SIZE / 2;

/** Viewer — bright analytics purple (Initiative). */
export const RELATIONSHIP_RING_VIEWER_STROKE =
  RELATIONSHIP_METRIC_COLORS.INITIATIVE;
/** People — muted purple-gray. */
export const RELATIONSHIP_RING_OTHER_STROKE = '#6E5C7A';
/** Hold progress — solid action purple (no gradient / glow). */
export const RELATIONSHIP_RING_HOLD_STROKE = '#AE5CDB';

const VIEWER_OPACITY = 0.95;
const OTHER_OPACITY = 0.85;
/** Base relationship arcs while hold progress is active. */
const BASE_DIMMED_OPACITY = 0.28;

const MIN_ARC_SWEEP_DEG = 0.5;
const SWEEP_CLOCKWISE = 1 as const;
/** Hold fill starts at 12 o'clock (SVG y-down). */
const HOLD_ARC_START_DEG = 270;

export type RelationshipRingPrimitiveProps = {
  /** 0..1 when available; ignored when neutral. */
  viewerShare?: number | null;
  otherShare?: number | null;
  /** Track-only (loading / low-data / error). */
  neutral?: boolean;
  /**
   * Confirm-hold fill 0..1. Drawn above the relationship base.
   * Not energy — only hold duration.
   */
  holdProgress?: number;
  className?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(opts: {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweepFlag: 0 | 1;
}): string {
  const { cx, cy, radius, startAngle, endAngle, sweepFlag } = opts;
  const from = polar(cx, cy, radius, startAngle);
  const to = polar(cx, cy, radius, endAngle);
  const delta =
    sweepFlag === SWEEP_CLOCKWISE
      ? ((endAngle - startAngle) % 360 + 360) % 360
      : ((startAngle - endAngle) % 360 + 360) % 360;
  const largeArcFlag = delta > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${to.x} ${to.y}`;
}

function arcSegmentPath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  sweepDeg: number,
): string | null {
  if (sweepDeg < MIN_ARC_SWEEP_DEG) return null;
  const normalizedStartDeg = ((startDeg % 360) + 360) % 360;
  return describeArc({
    cx,
    cy,
    radius,
    startAngle: normalizedStartDeg,
    endAngle: normalizedStartDeg + sweepDeg,
    sweepFlag: SWEEP_CLOCKWISE,
  });
}

/**
 * Shared lobby / confirm relationship ring geometry.
 * One visual language: stroke 10, round caps, dual segments + optional hold overlay.
 */
export function RelationshipRingPrimitive({
  viewerShare = null,
  otherShare = null,
  neutral = false,
  holdProgress = 0,
  className = '',
}: RelationshipRingPrimitiveProps) {
  const progress = clamp01(holdProgress);
  const holdActive = progress > 0.001;
  const showSegments =
    !neutral &&
    typeof viewerShare === 'number' &&
    Number.isFinite(viewerShare) &&
    typeof otherShare === 'number' &&
    Number.isFinite(otherShare);

  const { viewerSweepDeg, otherSweepDeg, viewerStartDeg, otherStartDeg } =
    dualSegmentArcDegrees(
      showSegments ? clamp01(viewerShare as number) : 0,
      showSegments ? clamp01(otherShare as number) : 0,
      RELATIONSHIP_RING_RADIUS,
      RELATIONSHIP_RING_STROKE,
    );

  const viewerPath = showSegments
    ? arcSegmentPath(
        CX,
        CY,
        RELATIONSHIP_RING_RADIUS,
        viewerStartDeg,
        viewerSweepDeg,
      )
    : null;
  const otherPath = showSegments
    ? arcSegmentPath(
        CX,
        CY,
        RELATIONSHIP_RING_RADIUS,
        otherStartDeg,
        otherSweepDeg,
      )
    : null;

  const holdSweepDeg = progress >= 0.999 ? 359.5 : 360 * progress;
  const holdPath =
    progress > 0.001
      ? arcSegmentPath(
          CX,
          CY,
          RELATIONSHIP_RING_RADIUS,
          HOLD_ARC_START_DEG,
          holdSweepDeg,
        )
      : null;

  const segmentViewerOpacity = holdActive ? BASE_DIMMED_OPACITY : VIEWER_OPACITY;
  const segmentOtherOpacity = holdActive ? BASE_DIMMED_OPACITY : OTHER_OPACITY;

  return (
    <svg
      className={`relationship-ring-primitive${
        className ? ` ${className}` : ''
      }${!showSegments ? ' relationship-ring-primitive--neutral' : ''}${
        holdActive ? ' relationship-ring-primitive--holding' : ''
      }`}
      viewBox={`0 0 ${RELATIONSHIP_RING_SIZE} ${RELATIONSHIP_RING_SIZE}`}
      aria-hidden
      data-viewer-anchor={VIEWER_ARC_ANCHOR_DEG}
      data-other-anchor={OTHER_ARC_ANCHOR_DEG}
      data-hold-progress={progress.toFixed(3)}
    >
      <circle
        className="relationship-ring-primitive__track"
        cx={CX}
        cy={CY}
        r={RELATIONSHIP_RING_RADIUS}
        fill="none"
        stroke={RELATIONSHIP_ORB_TRACK}
        strokeWidth={RELATIONSHIP_RING_STROKE}
        strokeLinecap="round"
      />
      {otherPath ? (
        <path
          className="relationship-ring-primitive__other"
          d={otherPath}
          fill="none"
          stroke={RELATIONSHIP_RING_OTHER_STROKE}
          strokeWidth={RELATIONSHIP_RING_STROKE}
          strokeLinecap="round"
          opacity={segmentOtherOpacity}
        />
      ) : null}
      {viewerPath ? (
        <path
          className="relationship-ring-primitive__viewer"
          d={viewerPath}
          fill="none"
          stroke={RELATIONSHIP_RING_VIEWER_STROKE}
          strokeWidth={RELATIONSHIP_RING_STROKE}
          strokeLinecap="round"
          opacity={segmentViewerOpacity}
        />
      ) : null}
      {holdPath ? (
        <path
          className="relationship-ring-primitive__hold"
          d={holdPath}
          fill="none"
          stroke={RELATIONSHIP_RING_HOLD_STROKE}
          strokeWidth={RELATIONSHIP_RING_STROKE}
          strokeLinecap="round"
          opacity={0.95}
        />
      ) : null}
    </svg>
  );
}
