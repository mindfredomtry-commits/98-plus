'use client';

import type { CSSProperties } from 'react';

type Props = {
  /** Influence level 0–100 (from internal energy, not shown as number). */
  value: number;
  className?: string;
  /** Disable CSS transition while RAF-driven intro fill runs. */
  disableTransition?: boolean;
  /** Boot intro: CSS keyframes drive stroke-dashoffset — omit inline SVG attrs. */
  bootCssFillActive?: boolean;
};

export const INFLUENCE_RING_CIRCUMFERENCE = 2 * Math.PI * ((280 - 2.5) / 2);

const SIZE = 280;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = INFLUENCE_RING_CIRCUMFERENCE;

export function InfluenceRing({
  value,
  className = '',
  disableTransition = false,
  bootCssFillActive = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const dashOffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <svg
      className={`influence-ring${
        disableTransition ? ' influence-ring--no-transition' : ''
      }${bootCssFillActive ? ' influence-ring--boot-css-fill' : ''}${
        className ? ` ${className}` : ''
      }`}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
    >
      <circle
        className="influence-ring__track"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
      />
      <circle
        className="influence-ring__progress"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        {...(bootCssFillActive
          ? {}
          : {
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: dashOffset,
            })}
        style={
          disableTransition
            ? ({ transition: 'none' } satisfies CSSProperties)
            : undefined
        }
      />
    </svg>
  );
}
