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
import type { GlobalRelationshipOrbRingState } from '@/lib/use-global-relationship-orb';

type Props = {
  ringState: GlobalRelationshipOrbRingState;
  className?: string;
};

/**
 * Match RelationshipOrb OUTER ring geometry (analytics visual language).
 * SIZE 280 + RADIUS 118 + STROKE 10 keeps stroke inside the viewBox
 * (outer edge ≈ 123 < 140).
 */
const SIZE = 280;
const STROKE = 10;
const RADIUS = 118;
const CX = SIZE / 2;
const CY = SIZE / 2;

/** Viewer — bright analytics purple (Initiative). */
const VIEWER_STROKE = RELATIONSHIP_METRIC_COLORS.INITIATIVE;
/** People — muted purple-gray; solid enough to read without perspective mute. */
const OTHER_STROKE = '#6E5C7A';
const VIEWER_OPACITY = 0.95;
const OTHER_OPACITY = 0.85;

const MIN_ARC_SWEEP_DEG = 0.5;
const SWEEP_CLOCKWISE = 1 as const;

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
 * Single dual-segment ring for the lobby Global Relationship Orb.
 * Neutral track-only for loading / low-data / error (no energy fallback, no fake 50/50).
 */
export function GlobalRelationshipRing({ ringState, className = '' }: Props) {
  const showSegments = ringState.status === 'available';
  const viewerShare = showSegments ? ringState.viewerShare : 0;
  const otherShare = showSegments ? ringState.otherShare : 0;

  const { viewerSweepDeg, otherSweepDeg, viewerStartDeg, otherStartDeg } =
    dualSegmentArcDegrees(viewerShare, otherShare, RADIUS, STROKE);

  const viewerPath = showSegments
    ? arcSegmentPath(CX, CY, RADIUS, viewerStartDeg, viewerSweepDeg)
    : null;
  const otherPath = showSegments
    ? arcSegmentPath(CX, CY, RADIUS, otherStartDeg, otherSweepDeg)
    : null;

  return (
    <svg
      className={`global-relationship-ring${className ? ` ${className}` : ''}${
        showSegments ? '' : ' global-relationship-ring--neutral'
      }`}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
      data-ring-status={ringState.status}
      data-viewer-anchor={VIEWER_ARC_ANCHOR_DEG}
      data-other-anchor={OTHER_ARC_ANCHOR_DEG}
    >
      <circle
        className="global-relationship-ring__track"
        cx={CX}
        cy={CY}
        r={RADIUS}
        fill="none"
        stroke={RELATIONSHIP_ORB_TRACK}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      {otherPath ? (
        <path
          className="global-relationship-ring__other"
          d={otherPath}
          fill="none"
          stroke={OTHER_STROKE}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={OTHER_OPACITY}
        />
      ) : null}
      {viewerPath ? (
        <path
          className="global-relationship-ring__viewer"
          d={viewerPath}
          fill="none"
          stroke={VIEWER_STROKE}
          strokeWidth={STROKE}
          strokeLinecap="round"
          opacity={VIEWER_OPACITY}
        />
      ) : null}
    </svg>
  );
}
