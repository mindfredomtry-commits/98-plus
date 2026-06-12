'use client';

import type { CSSProperties } from 'react';

type Props = {
  /** Influence level 0–100 (from internal energy, not shown as number). */
  value: number;
  className?: string;
  /** Disable CSS transition on progress stroke. */
  disableTransition?: boolean;
  /** Boot scene only — CSS keyframes drive stroke, no inline dash attrs. */
  bootFillActive?: boolean;
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
  bootFillActive = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const targetRatio = clamped / 100;
  const targetDashoffset = CIRCUMFERENCE * (1 - targetRatio);
  const dashOffset = CIRCUMFERENCE - targetRatio * CIRCUMFERENCE;

  const bootProgressStyle = bootFillActive
    ? ({
        transition: 'none',
        '--ring-circumference': CIRCUMFERENCE,
        '--boot-ring-target-dashoffset': targetDashoffset,
        '--boot-ring-target-ratio': targetRatio,
      } satisfies CSSProperties)
    : undefined;

  return (
    <svg
      className={`influence-ring${
        disableTransition ? ' influence-ring--no-transition' : ''
      }${className ? ` ${className}` : ''}`}
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
        className={`influence-ring__progress${
          bootFillActive ? ' lobby-boot-progress-stroke' : ''
        }`}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        {...(bootFillActive
          ? {}
          : {
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: dashOffset,
            })}
        style={
          bootFillActive
            ? bootProgressStyle
            : disableTransition
              ? ({ transition: 'none' } satisfies CSSProperties)
              : undefined
        }
      />
    </svg>
  );
}
