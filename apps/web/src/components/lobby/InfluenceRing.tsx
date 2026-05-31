'use client';

type Props = {
  /** Influence level 0–100 (from internal energy, not shown as number). */
  value: number;
  className?: string;
};

const SIZE = 280;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function InfluenceRing({ value, className = '' }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const dashOffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <svg
      className={`influence-ring ${className}`.trim()}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="influence-ring-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
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
      />
    </svg>
  );
}
