'use client';

import { AvatarImage } from '../AvatarImage';
import type {
  RelationshipOrbDimension,
  RelationshipRing,
} from '@/lib/relationship-analytics-types';

type Props = {
  dimensions: RelationshipOrbDimension[];
  peerAvatarUrl?: string | null;
  peerDisplayName?: string | null;
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

/** Arc origin at 9 o'clock (left). polar() uses standard math degrees: 0=right, 180=left. */
const ARC_ORIGIN_DEG = 180;

/** SVG sweep: 1 = clockwise (increasing angle), 0 = counter-clockwise. */
const SWEEP_CLOCKWISE = 1 as const;
const SWEEP_COUNTER_CLOCKWISE = 0 as const;

function clampShare(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Bidirectional fill from ARC_ORIGIN: total = share×360, half each direction.
 * Exported for geometry assertions.
 */
export function bidirectionalArcDegrees(share: number): {
  totalArcDeg: number;
  halfArcDeg: number;
} {
  const s = clampShare(share);
  const totalArcDeg = s * 360;
  return { totalArcDeg, halfArcDeg: totalArcDeg / 2 };
}

if (process.env.NODE_ENV !== 'production') {
  const fixtures: Array<[number, number, number]> = [
    [0, 0, 0],
    [0.25, 90, 45],
    [0.5, 180, 90],
    [0.54, 194.4, 97.2],
    [1, 360, 180],
  ];
  for (const [share, expectedTotal, expectedHalf] of fixtures) {
    const { totalArcDeg, halfArcDeg } = bidirectionalArcDegrees(share);
    if (
      Math.abs(totalArcDeg - expectedTotal) > 1e-9 ||
      Math.abs(halfArcDeg - expectedHalf) > 1e-9
    ) {
      throw new Error(
        `[RelationshipOrb] arc geometry assert failed for share=${share}: ` +
          `got total=${totalArcDeg} half=${halfArcDeg}, ` +
          `expected total=${expectedTotal} half=${expectedHalf}`,
      );
    }
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
  return direction === 'VIEWER' || direction === 'OTHER' || direction === 'BALANCED';
}

function peerLetter(name: string | null | undefined): string {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

/**
 * Triple concentric relationship orb.
 * Active fill: viewerShare × 360°, split equally from left origin (180°) CW + CCW.
 * OUTER=INITIATIVE, MIDDLE=RESPONSIVENESS, INNER=RESPECT.
 * Center is peer avatar only — no 98+ mark.
 */
export function RelationshipOrb({
  dimensions,
  peerAvatarUrl,
  peerDisplayName,
}: Props) {
  const byRing = new Map<'OUTER' | 'MIDDLE' | 'INNER', RelationshipOrbDimension>();
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
      className="monetization-orb"
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
          const available = dim?.available !== false;
          const direction =
            typeof dim?.direction === 'string' ? dim.direction : undefined;
          const hasNumericShare =
            typeof dim?.viewerShare === 'number' &&
            Number.isFinite(dim.viewerShare);
          const muted =
            !dim ||
            !available ||
            !hasNumericShare ||
            direction === 'LOW_DATA' ||
            direction === 'NOT_AVAILABLE' ||
            !isActiveDirection(direction) ||
            dim.publishable === false;

          const share = muted ? 0 : clampShare(dim.viewerShare as number);
          const { halfArcDeg } = bidirectionalArcDegrees(share);
          const isFull = share >= 0.999;
          const hasActive = !muted && share > 0;

          const clockwiseEndDeg = ARC_ORIGIN_DEG + halfArcDeg;
          const counterClockwiseEndDeg = ARC_ORIGIN_DEG - halfArcDeg;

          const trackOpacity = muted ? 0.18 : 0.28;
          const arcOpacity = muted
            ? 0
            : ring === 'OUTER'
              ? 0.95
              : ring === 'MIDDLE'
                ? 0.8
                : 0.65;
          const activeStroke = 'rgba(196, 168, 255, 0.95)';

          return (
            <g key={ring}>
              <circle
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="rgba(167, 139, 250, 0.22)"
                strokeWidth={STROKE}
                opacity={trackOpacity}
              />
              {hasActive && isFull ? (
                <circle
                  cx={CX}
                  cy={CY}
                  r={r}
                  fill="none"
                  stroke={activeStroke}
                  strokeWidth={STROKE}
                  opacity={arcOpacity}
                />
              ) : null}
              {hasActive && !isFull && halfArcDeg > 0 ? (
                <>
                  <path
                    d={describeArc({
                      cx: CX,
                      cy: CY,
                      radius: r,
                      startAngle: ARC_ORIGIN_DEG,
                      endAngle: clockwiseEndDeg,
                      sweepFlag: SWEEP_CLOCKWISE,
                    })}
                    fill="none"
                    stroke={activeStroke}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    opacity={arcOpacity}
                  />
                  <path
                    d={describeArc({
                      cx: CX,
                      cy: CY,
                      radius: r,
                      startAngle: ARC_ORIGIN_DEG,
                      endAngle: counterClockwiseEndDeg,
                      sweepFlag: SWEEP_COUNTER_CLOCKWISE,
                    })}
                    fill="none"
                    stroke={activeStroke}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    opacity={arcOpacity}
                  />
                  {/* Soften round-cap overlap at shared origin */}
                  <circle
                    cx={polar(CX, CY, r, ARC_ORIGIN_DEG).x}
                    cy={polar(CX, CY, r, ARC_ORIGIN_DEG).y}
                    r={STROKE / 2}
                    fill={activeStroke}
                    opacity={arcOpacity}
                  />
                </>
              ) : null}
              {!muted && direction === 'VIEWER' ? (
                <circle
                  cx={polar(CX, CY, r, ARC_ORIGIN_DEG).x}
                  cy={polar(CX, CY, r, ARC_ORIGIN_DEG).y}
                  r={4.5}
                  fill="rgba(230, 220, 255, 0.95)"
                />
              ) : null}
              {!muted && direction === 'OTHER' && hasActive && !isFull ? (
                <>
                  <circle
                    cx={polar(CX, CY, r, clockwiseEndDeg).x}
                    cy={polar(CX, CY, r, clockwiseEndDeg).y}
                    r={4.5}
                    fill="rgba(230, 220, 255, 0.95)"
                  />
                  <circle
                    cx={polar(CX, CY, r, counterClockwiseEndDeg).x}
                    cy={polar(CX, CY, r, counterClockwiseEndDeg).y}
                    r={4.5}
                    fill="rgba(230, 220, 255, 0.95)"
                  />
                </>
              ) : null}
              {!muted && direction === 'BALANCED' ? (
                <circle
                  cx={polar(CX, CY, r, ARC_ORIGIN_DEG).x}
                  cy={polar(CX, CY, r, ARC_ORIGIN_DEG).y}
                  r={3.5}
                  fill="rgba(200, 185, 255, 0.7)"
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
          sizeClass="w-32 h-32"
          textClass="text-4xl"
          ringClassName="ring-white/15"
          priority
        />
      </div>
    </div>
  );
}
