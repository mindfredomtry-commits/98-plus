'use client';

import { AvatarImage } from '../AvatarImage';
import type { RelationshipOrbDimension } from '@/lib/relationship-analytics-types';

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

function clampShare(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** SVG y-down: 0° = right, 90° = down, 180° = left, 270° = up. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Arc from startAngle → endAngle along increasing degrees (clockwise on screen). */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const from = polar(cx, cy, r, startAngle);
  const to = polar(cx, cy, r, endAngle);
  const delta = ((endAngle - startAngle) % 360 + 360) % 360;
  const large = delta > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`;
}

function ringForDim(
  dim: RelationshipOrbDimension,
): 'OUTER' | 'MIDDLE' | 'INNER' | null {
  if (dim.ring === 'OUTER' || dim.ring === 'MIDDLE' || dim.ring === 'INNER') {
    return dim.ring;
  }
  if (dim.code === 'INITIATIVE') return 'OUTER';
  if (dim.code === 'RESPONSIVENESS') return 'MIDDLE';
  if (dim.code === 'THIRD_DIMENSION_PENDING') return 'INNER';
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
 * Arcs always begin at the left (180°). Arc length from max(viewerShare, otherShare).
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
          const muted =
            !dim ||
            !available ||
            direction === 'LOW_DATA' ||
            direction === 'NOT_AVAILABLE' ||
            !isActiveDirection(direction);

          const viewer = clampShare(dim?.viewerShare ?? null);
          const other = clampShare(dim?.otherShare ?? null);
          const hasShares =
            dim?.viewerShare != null || dim?.otherShare != null;
          const arcShare = hasShares ? Math.max(viewer, other) : 0;
          const arcDeg = muted ? 0 : Math.max(12, arcShare * 270);

          // All arcs originate at left (180°); length/direction markers unchanged in meaning.
          const start = ARC_ORIGIN_DEG;
          const end = ARC_ORIGIN_DEG + arcDeg;

          const trackOpacity = muted ? 0.18 : 0.28;
          const arcOpacity = muted
            ? 0
            : ring === 'OUTER'
              ? 0.95
              : ring === 'MIDDLE'
                ? 0.8
                : 0.65;

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
              {!muted && arcDeg > 0 ? (
                <path
                  d={describeArc(CX, CY, r, start, end)}
                  fill="none"
                  stroke="rgba(196, 168, 255, 0.95)"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  opacity={arcOpacity}
                />
              ) : null}
              {!muted && direction === 'VIEWER' ? (
                <circle
                  cx={polar(CX, CY, r, start).x}
                  cy={polar(CX, CY, r, start).y}
                  r={4.5}
                  fill="rgba(230, 220, 255, 0.95)"
                />
              ) : null}
              {!muted && direction === 'OTHER' ? (
                <circle
                  cx={polar(CX, CY, r, end).x}
                  cy={polar(CX, CY, r, end).y}
                  r={4.5}
                  fill="rgba(230, 220, 255, 0.95)"
                />
              ) : null}
              {!muted && direction === 'BALANCED' ? (
                <circle
                  cx={polar(CX, CY, r, (start + end) / 2).x}
                  cy={polar(CX, CY, r, (start + end) / 2).y}
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
