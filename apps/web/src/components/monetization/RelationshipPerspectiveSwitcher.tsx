'use client';

import type { RelationshipPerspective } from './relationship-metric-colors';

type Props = {
  perspective: RelationshipPerspective;
  onChange: (next: RelationshipPerspective) => void;
  viewerLabel: string;
  otherLabel: string;
  /** Optional override for the group label. */
  groupLabel?: string;
};

/**
 * Shared «ты / peer» (or «Ты / Люди») chips under RelationshipOrb.
 * Visuals live in monetization.css — keep both screens on this component.
 */
export function RelationshipPerspectiveSwitcher({
  perspective,
  onChange,
  viewerLabel,
  otherLabel,
  groupLabel = 'Перспектива',
}: Props) {
  return (
    <div
      className="monetization-relationship__perspective"
      role="group"
      aria-label={groupLabel}
    >
      <button
        type="button"
        className={`monetization-perspective-chip${
          perspective === 'viewer'
            ? ' monetization-perspective-chip--active'
            : ''
        }`}
        aria-pressed={perspective === 'viewer'}
        aria-label={viewerLabel}
        onClick={() => onChange('viewer')}
      >
        {viewerLabel}
      </button>
      <button
        type="button"
        className={`monetization-perspective-chip${
          perspective === 'other'
            ? ' monetization-perspective-chip--active'
            : ''
        }`}
        aria-pressed={perspective === 'other'}
        aria-label={otherLabel}
        onClick={() => onChange('other')}
      >
        {otherLabel}
      </button>
    </div>
  );
}
