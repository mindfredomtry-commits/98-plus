'use client';

import type { RelationshipOrbDimension } from '@/lib/relationship-analytics-types';

type Props = {
  dimension: RelationshipOrbDimension;
  viewerLabel: string;
  peerLabel: string;
};

/**
 * Horizontal direction row: viewer ← / • / → peer.
 * Arrow means lean toward a side — never up/down growth.
 */
export function RelationshipDirectionRow({
  dimension,
  viewerLabel,
  peerLabel,
}: Props) {
  const direction =
    typeof dimension.direction === 'string' ? dimension.direction : '';

  if (direction === 'NOT_AVAILABLE' || dimension.available === false) {
    return null;
  }

  const title = dimension.title?.trim() || null;
  const description = dimension.description?.trim() || null;
  const displayValue = dimension.displayValue?.trim() || null;

  let marker: 'viewer' | 'other' | 'balanced' | 'muted' = 'muted';
  if (direction === 'VIEWER') marker = 'viewer';
  else if (direction === 'OTHER') marker = 'other';
  else if (direction === 'BALANCED') marker = 'balanced';
  else if (direction === 'LOW_DATA') marker = 'muted';

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
