'use client';

import { AvatarImage } from '../AvatarImage';
import type {
  RelationshipOrbDimension,
  RelationshipRing,
} from '@/lib/relationship-analytics-types';
import {
  getRelationshipMetricColor,
  RELATIONSHIP_ORB_OTHER_OPACITY,
  RELATIONSHIP_ORB_TRACK,
} from './relationship-metric-colors';

type Props = {
  dimensions: RelationshipOrbDimension[];
  peerAvatarUrl?: string | null;
  peerDisplayName?: string | null;
  /** Smaller orb for one-viewport relationship screen. */
  compact?: boolean;
};

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;

/**
 * Tight concentric rings — ~4px visual gap between strokes (stroke 10).
 * Centerline spacing = 14 → OUTER 118, MIDDLE 104, INNER 90.
 */
const STROKE = 10;
const RING_RADIUS: Record<'OUTER' | 'MIDDLE' | 'INNER', number> = {
  OUTER: 118,
  MIDDLE: 104,
  INNER: 90,
};

/** Angular gap between viewer and other arc segments (each ring has two gaps). */
export const RELATIONSHIP_ORB_SEGMENT_GAP_DEG = 14;

/** Viewer arc origin — lower-left (~7–8 o'clock). polar(): 0=right, 180=left. */
export const VIEWER_ARC_START_DEG = 210;

/** SVG sweep: 1 = clockwise (increasing angle), 0 = counter-clockwise. */
const SWEEP_CLOCKWISE = 1 as const;

const MIN_ARC_SWEEP_DEG = 0.5;

function clampShare(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Independent viewer + other arcs with fixed angular gaps (not a continuous fill bar).
 * Exported for geometry assertions.
 */
export function dualSegmentArcDegrees(
  viewerShare: number,
  otherShare: number,
): {
  gapDeg: number;
  usableSweepDeg: number;
  viewerSweepDeg: number;
  otherSweepDeg: number;
  viewerStartDeg: number;
  otherStartDeg: number;
} {
  const gapDeg = RELATIONSHIP_ORB_SEGMENT_GAP_DEG;
  const usableSweepDeg = 360 - gapDeg * 2;
  const viewerSweepDeg = usableSweepDeg * clampShare(viewerShare);
  const otherSweepDeg = usableSweepDeg * clampShare(otherShare);
  const viewerStartDeg = VIEWER_ARC_START_DEG;
  const otherStartDeg = viewerStartDeg + viewerSweepDeg + gapDeg;
  return {
    gapDeg,
    usableSweepDeg,
    viewerSweepDeg,
    otherSweepDeg,
    viewerStartDeg,
    otherStartDeg,
  };
}

if (process.env.NODE_ENV !== 'production') {
  const { usableSweepDeg, gapDeg } = dualSegmentArcDegrees(0, 0);
  if (usableSweepDeg !== 360 - gapDeg * 2) {
    throw new Error('[RelationshipOrb] usableSweepDeg assert failed');
  }
  const half = dualSegmentArcDegrees(0.5, 0.5);
  if (
    Math.abs(half.viewerSweepDeg - half.usableSweepDeg / 2) > 1e-9 ||
    Math.abs(half.otherSweepDeg - half.usableSweepDeg / 2) > 1e-9
  ) {
    throw new Error('[RelationshipOrb] 50/50 split assert failed');
  }
  const fullViewer = dualSegmentArcDegrees(1, 0);
  if (Math.abs(fullViewer.viewerSweepDeg - fullViewer.usableSweepDeg) > 1e-9) {
    throw new Error('[RelationshipOrb] full viewer assert failed');
  }
  const combined = dualSegmentArcDegrees(0.59, 0.41);
  if (
    Math.abs(
      combined.viewerSweepDeg +
        combined.otherSweepDeg -
        combined.usableSweepDeg,
    ) > 1e-9
  ) {
    throw new Error('[RelationshipOrb] shares sum assert failed');
  }
}

/** SVG y-down: 0° = right, 90° = down, 180° = left, 270° = up. */
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
  // Span along the chosen sweep direction (CW = increasing angle).
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
  return describeArc({
    cx,
    cy,
    radius,
    startAngle: startDeg,
    endAngle: startDeg + sweepDeg,
    sweepFlag: SWEEP_CLOCKWISE,
  });
}

function ringForDim(dim: RelationshipOrbDimension): RelationshipRing | null {
  if (dim.ring === 'OUTER' || dim.ring === 'MIDDLE' || dim.ring === 'INNER') {
    return dim.ring;
  }
  if (dim.code === 'INITIATIVE') return 'OUTER';
  if (dim.code === 'RESPONSIVENESS') return 'MIDDLE';
  if (dim.code === 'RESPECT') return 'INNER';
  return null;
}

function isActiveDirection(direction: string | undefined): boolean {
  return (
    direction === 'VIEWER' ||
    direction === 'OTHER' ||
    direction === 'BALANCED'
  );
}

function peerLetter(name: string | null | undefined): string {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

/**
 * Triple concentric relationship orb.
 * Each ring: independent viewer + other arcs with angular gaps (not a fill bar).
 * OUTER=INITIATIVE, MIDDLE=RESPONSIVENESS, INNER=RESPECT.
 * Center is peer avatar only — no 98+ mark.
 */
export function RelationshipOrb({
  dimensions,
  peerAvatarUrl,
  peerDisplayName,
  compact = false,
}: Props) {
  const byRing = new Map<
    'OUTER' | 'MIDDLE' | 'INNER',
    RelationshipOrbDimension
  >();
  for (const dim of dimensions) {
    const ring = ringForDim(dim);
    if (!ring) continue;
    byRing.set(ring, dim);
  }

  const rings: Array<'OUTER' | 'MIDDLE' | 'INNER'> = [
    'OUTER',
    'MIDDLE',
    'INNER',
  ];

  return (
    <div
      className={`monetization-orb${compact ? ' monetization-orb--compact' : ''}`}
      role="img"
      aria-label={
        peerDisplayName
          ? `Динамика отношений с ${peerDisplayName}`
          : 'Динамика отношений'
      }
    >
      <svg
        className="monetization-orb__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        height="100%"
        aria-hidden
      >
        {rings.map((ring) => {
          const dim = byRing.get(ring);
          const r = RING_RADIUS[ring];
          const metricColor = getRelationshipMetricColor(dim?.code, ring);
          const available = dim?.available !== false;
          const direction =
            typeof dim?.direction === 'string' ? dim.direction : undefined;
          const hasNumericShares =
            typeof dim?.viewerShare === 'number' &&
            Number.isFinite(dim.viewerShare) &&
            typeof dim?.otherShare === 'number' &&
            Number.isFinite(dim.otherShare);
          const muted =
            !dim ||
            !available ||
            !hasNumericShares ||
            direction === 'LOW_DATA' ||
            direction === 'NOT_AVAILABLE' ||
            !isActiveDirection(direction) ||
            dim.publishable === false;

          const viewerShare = muted ? 0 : clampShare(dim.viewerShare as number);
          const otherShare = muted ? 0 : clampShare(dim.otherShare as number);
          const {
            viewerSweepDeg,
            otherSweepDeg,
            viewerStartDeg,
            otherStartDeg,
          } = dualSegmentArcDegrees(viewerShare, otherShare);

          const viewerPath = muted
            ? null
            : arcSegmentPath(CX, CY, r, viewerStartDeg, viewerSweepDeg);
          const otherPath = muted
            ? null
            : arcSegmentPath(CX, CY, r, otherStartDeg, otherSweepDeg);

          const otherMarkerDeg =
            otherSweepDeg >= MIN_ARC_SWEEP_DEG
              ? otherStartDeg + otherSweepDeg / 2
              : null;

          return (
            <g key={ring}>
              <circle
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke={RELATIONSHIP_ORB_TRACK}
                strokeWidth={STROKE}
                opacity={1}
              />
              {otherPath ? (
                <path
                  d={otherPath}
                  fill="none"
                  stroke={metricColor}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  opacity={RELATIONSHIP_ORB_OTHER_OPACITY}
                />
              ) : null}
              {viewerPath ? (
                <path
                  d={viewerPath}
                  fill="none"
                  stroke={metricColor}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  opacity={0.95}
                />
              ) : null}
              {!muted && direction === 'VIEWER' ? (
                <circle
                  cx={polar(CX, CY, r, viewerStartDeg).x}
                  cy={polar(CX, CY, r, viewerStartDeg).y}
                  r={4.5}
                  fill={metricColor}
                  opacity={0.95}
                />
              ) : null}
              {!muted && direction === 'OTHER' && otherMarkerDeg != null ? (
                <circle
                  cx={polar(CX, CY, r, otherMarkerDeg).x}
                  cy={polar(CX, CY, r, otherMarkerDeg).y}
                  r={4.5}
                  fill={metricColor}
                  opacity={0.95}
                />
              ) : null}
              {!muted && direction === 'BALANCED' ? (
                <circle
                  cx={polar(CX, CY, r, viewerStartDeg).x}
                  cy={polar(CX, CY, r, viewerStartDeg).y}
                  r={3.5}
                  fill={metricColor}
                  opacity={0.55}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="monetization-orb__peer" aria-hidden>
        <AvatarImage
          src={peerAvatarUrl}
          letter={peerLetter(peerDisplayName)}
          sizeClass={compact ? 'w-16 h-16' : 'w-32 h-32'}
          textClass={compact ? 'text-xl' : 'text-4xl'}
          ringClassName="ring-white/15"
          priority
        />
      </div>
    </div>
  );
}
