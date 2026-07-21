/** Minimal metric color system for relationship orb + compact tiles. */

export const RELATIONSHIP_METRIC_COLORS = {
  INITIATIVE: '#9900B8',
  RESPONSIVENESS: '#E000D2',
  RESPECT: '#FF3158',
} as const;

export type RelationshipMetricColorCode = keyof typeof RELATIONSHIP_METRIC_COLORS;

const RING_TO_METRIC: Record<'OUTER' | 'MIDDLE' | 'INNER', RelationshipMetricColorCode> =
  {
    OUTER: 'INITIATIVE',
    MIDDLE: 'RESPONSIVENESS',
    INNER: 'RESPECT',
  };

export function getRelationshipMetricColor(
  code?: string | null,
  ring?: 'OUTER' | 'MIDDLE' | 'INNER' | null,
): string {
  if (code && code in RELATIONSHIP_METRIC_COLORS) {
    return RELATIONSHIP_METRIC_COLORS[code as RelationshipMetricColorCode];
  }
  if (ring && RING_TO_METRIC[ring]) {
    return RELATIONSHIP_METRIC_COLORS[RING_TO_METRIC[ring]];
  }
  return RELATIONSHIP_METRIC_COLORS.INITIATIVE;
}

/** Dark empty track under orb rings — not red. */
export const RELATIONSHIP_ORB_TRACK = 'rgba(255, 255, 255, 0.08)';

/** Other-side / muted ring fill opacity. */
export const RELATIONSHIP_ORB_OTHER_OPACITY = 0.14;
