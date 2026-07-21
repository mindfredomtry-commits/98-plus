/**
 * Canonical Relationship Analytics direction thresholds.
 *
 * Viewer share is a 0..1 fraction of the metric ring.
 * Direction is decided on rounded percent so it matches displayValue.
 *
 * 49–51% inclusive → BALANCED
 * >51% → VIEWER
 * <49% → OTHER
 */

export const RELATIONSHIP_BALANCE_MIN = 49;
export const RELATIONSHIP_BALANCE_MAX = 51;

export type RelationshipMetricDirectionCode =
  | 'VIEWER'
  | 'OTHER'
  | 'BALANCED'
  | 'LOW_DATA';

/** Round viewerShare (0..1) to display percent 0..100. */
export function relationshipViewerSharePercent(
  viewerShare: number,
): number {
  return Math.round(Math.min(1, Math.max(0, viewerShare)) * 100);
}

/**
 * Single source of truth: viewer share → VIEWER / OTHER / BALANCED / LOW_DATA.
 * Does not invent NOT_AVAILABLE (callers gate availability separately).
 */
export function resolveRelationshipMetricDirection(
  viewerShare: number | null | undefined,
): RelationshipMetricDirectionCode {
  if (viewerShare == null || !Number.isFinite(viewerShare)) {
    return 'LOW_DATA';
  }

  const pct = relationshipViewerSharePercent(viewerShare);
  if (
    pct >= RELATIONSHIP_BALANCE_MIN &&
    pct <= RELATIONSHIP_BALANCE_MAX
  ) {
    return 'BALANCED';
  }
  if (pct > RELATIONSHIP_BALANCE_MAX) {
    return 'VIEWER';
  }
  return 'OTHER';
}
