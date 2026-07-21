'use client';

import type { RelationshipOrbDimension } from '@/lib/relationship-analytics-types';

type Props = {
  dimension: RelationshipOrbDimension;
  viewerLabel: string;
  peerLabel: string;
};

const TITLE_FALLBACK: Record<string, string> = {
  INITIATIVE: 'Инициатива',
  RESPONSIVENESS: 'Ответность',
  RESPECT: 'Уважение',
};

/**
 * Full horizontal direction row: viewer ← / • / → peer.
 * Direction and displayValue come from API — not recomputed from shares.
 * Do not use this inside `.monetization-relationship__tiles`.
 */
export function RelationshipDirectionRow({
  dimension,
  viewerLabel,
  peerLabel,
}: Props) {
  const direction = dimension.direction;

  if (direction === 'NOT_AVAILABLE') {
    return null;
  }

  let marker: 'viewer' | 'other' | 'balanced' | 'muted' = 'muted';
  if (direction === 'VIEWER') marker = 'viewer';
  else if (direction === 'OTHER') marker = 'other';
  else if (direction === 'BALANCED') marker = 'balanced';
  else if (direction === 'LOW_DATA' || !dimension.available) marker = 'muted';

  const title =
    dimension.title?.trim() || TITLE_FALLBACK[dimension.code] || null;
  const description = dimension.description?.trim() || null;
  const displayValue = dimension.displayValue?.trim() || null;

  return (
    <div className="monetization-direction">
      <div className="monetization-direction__rail">
        <span className="monetization-direction__side monetization-direction__side--viewer">
          {viewerLabel}
        </span>
        <div className="monetization-direction__mid">
          {title ? (
            <p className="monetization-direction__title">{title}</p>
          ) : null}
          <div
            className={`monetization-direction__arrow monetization-direction__arrow--${marker}`}
            aria-hidden
          >
            {marker === 'viewer' ? (
              <span className="monetization-direction__glyph">←</span>
            ) : null}
            {marker === 'other' ? (
              <span className="monetization-direction__glyph">→</span>
            ) : null}
            {marker === 'balanced' ? (
              <span className="monetization-direction__glyph monetization-direction__glyph--dot">
                •
              </span>
            ) : null}
            {marker === 'muted' ? (
              <span className="monetization-direction__glyph monetization-direction__glyph--muted">
                –
              </span>
            ) : null}
          </div>
        </div>
        <span className="monetization-direction__side monetization-direction__side--peer">
          {peerLabel}
        </span>
      </div>
      {description ? (
        <p className="monetization-direction__desc">{description}</p>
      ) : null}
      {displayValue ? (
        <p className="monetization-direction__value">{displayValue}</p>
      ) : null}
    </div>
  );
}
