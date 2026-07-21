/**
 * Shared relative-metric normalizer for Relationship ORB dimensions.
 *
 * Converts two non-negative linear scores into relative shares of one ring.
 * Used by RESPECT (and later INITIATIVE / RESPONSIVENESS after SQL parity).
 *
 * Does NOT invent direction thresholds — use
 * resolveRelationshipMetricDirection() /
 * analytics.relationship_metric_direction_v1
 * (BALANCED = rounded percent 49–51 inclusive).
 */

export type RelativeMetricReasonCode =
  | 'AVAILABLE'
  | 'MISSING_DIRECTION_DATA'
  | 'ZERO_TOTAL_SCORE'
  | 'INVALID_NEGATIVE_SCORE';

export type RelativeMetricResult =
  | {
      available: true;
      viewerShare: number;
      otherShare: number;
      reasonCode: 'AVAILABLE';
    }
  | {
      available: false;
      viewerShare: null;
      otherShare: null;
      reasonCode:
        | 'MISSING_DIRECTION_DATA'
        | 'ZERO_TOTAL_SCORE'
        | 'INVALID_NEGATIVE_SCORE';
    };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Resolve relative shares from two linear scores.
 *
 * Accepts any non-negative scale (0.78/0.54 and 78/54 are equivalent ratios).
 * Null means missing observations — never coerced to 0.
 */
export function resolveRelativeMetric(
  viewerScore: number | null,
  otherScore: number | null,
): RelativeMetricResult {
  if (viewerScore == null || otherScore == null) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      reasonCode: 'MISSING_DIRECTION_DATA',
    };
  }

  if (!isFiniteNumber(viewerScore) || !isFiniteNumber(otherScore)) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      reasonCode: 'MISSING_DIRECTION_DATA',
    };
  }

  if (viewerScore < 0 || otherScore < 0) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      reasonCode: 'INVALID_NEGATIVE_SCORE',
    };
  }

  const total = viewerScore + otherScore;
  if (total <= 0) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      reasonCode: 'ZERO_TOTAL_SCORE',
    };
  }

  const viewerShare = viewerScore / total;
  const otherShare = otherScore / total;

  return {
    available: true,
    viewerShare,
    otherShare,
    reasonCode: 'AVAILABLE',
  };
}
