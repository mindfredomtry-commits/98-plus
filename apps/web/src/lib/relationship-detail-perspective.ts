export type RelationshipDetailPerspective = 'viewer' | 'other';

/** Detail screen (`RelationshipAnalyticsScreen`) opens on the peer's side. */
export const RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE: RelationshipDetailPerspective =
  'other';

/** Overview (`AnalyticsPeerSelectScreen`) keeps viewer as default. */
export const RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE: RelationshipDetailPerspective =
  'viewer';

/**
 * When the detail screen stays mounted across peer changes, reset to `other`.
 * Same peer id (range/refetch) must keep the user's current choice.
 */
export function nextDetailPerspectiveForPeerChange(
  current: RelationshipDetailPerspective,
  previousPeerUserId: string | null | undefined,
  nextPeerUserId: string | null | undefined,
): RelationshipDetailPerspective {
  const prev = previousPeerUserId?.trim() || '';
  const next = nextPeerUserId?.trim() || '';
  if (!next || !prev || prev === next) return current;
  return RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE;
}
