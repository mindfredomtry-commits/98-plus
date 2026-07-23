export type RelationshipDetailPerspective = 'viewer' | 'other';

/** Detail screen (`RelationshipAnalyticsScreen`) opens on the peer's side. */
export const RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE: RelationshipDetailPerspective =
  'other';

/** Overview (`AnalyticsPeerSelectScreen`) keeps viewer as default. */
export const RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE: RelationshipDetailPerspective =
  'viewer';

/** Visible section title above the detail RelationshipOrb. */
export const RELATIONSHIP_DETAIL_SECTION_TITLE = 'динамика отношений';

/** Overview screen nav title (`AnalyticsPeerSelectScreen`). */
export const RELATIONSHIP_OVERVIEW_SECTION_TITLE = 'Профиль';

export const RELATIONSHIP_OVERVIEW_VIEWER_LABEL = 'Ты';
export const RELATIONSHIP_OVERVIEW_OTHER_LABEL = 'Люди';

/** Visible overview chip copy with direction arrows (for tests / docs). */
export const RELATIONSHIP_OVERVIEW_VIEWER_CHIP = 'Ты →';
export const RELATIONSHIP_OVERVIEW_OTHER_CHIP = '← Люди';

export function buildOverviewPerspectiveViewerAriaLabel(): string {
  return 'Показать мои действия по отношению к людям';
}

export function buildOverviewPerspectiveOtherAriaLabel(): string {
  return 'Показать действия людей по отношению ко мне';
}

export function buildDetailPerspectiveViewerAriaLabel(
  peerDisplayName: string,
): string {
  const peer = peerDisplayName.trim() || 'собеседнику';
  return `Показать мои действия по отношению к ${peer}`;
}

export function buildDetailPerspectiveOtherAriaLabel(
  peerDisplayName: string,
): string {
  const peer = peerDisplayName.trim() || 'собеседника';
  return `Показать действия ${peer} по отношению ко мне`;
}

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
