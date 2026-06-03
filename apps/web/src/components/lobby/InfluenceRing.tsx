'use client';

import type { CSSProperties } from 'react';

type Props = {
  /** Influence level 0–100 (from internal energy, not shown as number). */
  value: number;
  className?: string;
  /** Disable CSS transition while RAF-driven intro fill runs. */
  disableTransition?: boolean;
};

const SIZE = 280;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function InfluenceRing({
  value,
  className = '',
  disableTransition = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const dashOffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <svg
      className={`influence-ring${disableTransition ? ' influence-ring--no-transition' : ''}${
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
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        style={
          disableTransition
            ? ({ transition: 'none' } satisfies CSSProperties)
            : undefined
        }
      />
    </svg>
  );
}
