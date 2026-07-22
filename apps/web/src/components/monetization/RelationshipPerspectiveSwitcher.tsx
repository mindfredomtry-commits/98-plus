'use client';

import type { ReactNode } from 'react';
import type { RelationshipPerspective } from './relationship-metric-colors';

type Props = {
  perspective: RelationshipPerspective;
  onChange: (next: RelationshipPerspective) => void;
  viewerLabel: ReactNode;
  otherLabel: ReactNode;
  /**
   * Accessible names for the chips. Prefer these when labels include
   * decorative arrows (aria-hidden). Falls back to string labels.
   */
  viewerAriaLabel?: string;
  otherAriaLabel?: string;
  /** Optional override for the group label. */
  groupLabel?: string;
};

function resolveAriaLabel(
  explicit: string | undefined,
  label: ReactNode,
): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  if (typeof label === 'string' && label.trim()) return label.trim();
  return undefined;
}

/**
 * Shared «ты / peer» (or «Ты / Люди») chips under RelationshipOrb.
 * Visuals live in monetization.css — keep both screens on this component.
 */
export function RelationshipPerspectiveSwitcher({
  perspective,
  onChange,
  viewerLabel,
  otherLabel,
  viewerAriaLabel,
  otherAriaLabel,
  groupLabel = 'Перспектива',
}: Props) {
  const viewerAccessibleName = resolveAriaLabel(viewerAriaLabel, viewerLabel);
  const otherAccessibleName = resolveAriaLabel(otherAriaLabel, otherLabel);

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
        aria-label={viewerAccessibleName}
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
        aria-label={otherAccessibleName}
        onClick={() => onChange('other')}
      >
        {otherLabel}
      </button>
    </div>
  );
}
