export type RelationshipOrbCenterIdentity = {
  avatarUrl?: string | null;
  displayName?: string | null;
  /** Accessible name for the center portrait (e.g. «Ты» / peer name). */
  alt?: string | null;
};

export type RelationshipPerspectiveSide = 'viewer' | 'other';

/**
 * Resolve which portrait is active for a detail orb.
 * When both identities are provided, perspective selects the center.
 * Otherwise fall back to the single legacy peer portrait (overview).
 */
export function resolveRelationshipOrbCenterIdentity(
  perspective: RelationshipPerspectiveSide,
  viewer: RelationshipOrbCenterIdentity | null | undefined,
  other: RelationshipOrbCenterIdentity | null | undefined,
  legacyFallback?: RelationshipOrbCenterIdentity | null,
): RelationshipOrbCenterIdentity {
  if (viewer != null && other != null) {
    return perspective === 'viewer' ? viewer : other;
  }
  if (legacyFallback) return legacyFallback;
  if (other) return other;
  if (viewer) return viewer;
  return { avatarUrl: null, displayName: null, alt: null };
}

/** True when orb should crossfade between viewer and other portraits. */
export function hasSwitchableOrbCenterIdentities(
  viewer: RelationshipOrbCenterIdentity | null | undefined,
  other: RelationshipOrbCenterIdentity | null | undefined,
): boolean {
  return viewer != null && other != null;
}

export function relationshipOrbIdentityLetter(
  identity: RelationshipOrbCenterIdentity | null | undefined,
): string {
  const name = identity?.displayName?.trim();
  return (name?.[0] ?? '?').toUpperCase();
}
