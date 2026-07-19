'use client';

import type { RelationshipOrbDimension } from '@/lib/relationship-analytics-types';

type Props = {
  dimensions: RelationshipOrbDimension[];
  centerLabel?: string | null;
  peerDisplayName?: string | null;
};

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;

const RING_RADIUS: Record<'OUTER' | 'MIDDLE' | 'INNER', number> = {
  OUTER: 118,
  MIDDLE: 86,
  INNER: 54,
};

const STROKE = 10;

function clampShare(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
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

/**
 * Triple concentric relationship orb.
 * Arc magnitude = max(viewerShare, otherShare) when both sides present.
 * Direction is visual bias only — not evaluative color.
 */
export function RelationshipOrb({
  dimensions,
  centerLabel,
  peerDisplayName,
}: Props) {
  const label = (centerLabel?.trim() || '98+').slice(0, 8);
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
        aria-hidden={false}
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

          // Bias start angle: VIEWER leans left, OTHER leans right, BALANCED centered top.
          let start = -arcDeg / 2;
          if (direction === 'VIEWER') start = -arcDeg * 0.75;
          if (direction === 'OTHER') start = -arcDeg * 0.25;
          const end = start + arcDeg;

          const trackOpacity = muted ? 0.18 : 0.28;
          const arcOpacity = muted ? 0 : ring === 'OUTER' ? 0.95 : ring === 'MIDDLE' ? 0.8 : 0.65;

          const aria = [
            dim?.title,
            dim?.displayValue,
            dim?.description,
          ]
            .filter(Boolean)
            .join('. ');

          return (
            <g key={ring} aria-label={aria || undefined}>
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
              {/* Directional marker on active arc end toward the stronger side */}
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

        <circle
          cx={CX}
          cy={CY}
          r={34}
          fill="rgba(12, 8, 18, 0.92)"
          stroke="rgba(167, 139, 250, 0.35)"
          strokeWidth={1.5}
        />
        <text
          x={CX}
          y={CY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="monetization-orb__center-text"
          fill="rgba(255,255,255,0.92)"
          fontSize="18"
          fontWeight="800"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
