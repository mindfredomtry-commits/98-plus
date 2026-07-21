/**
 * Canonical aggregate of Initiative / Responsiveness / Respect into one
 * global viewer↔people share for the home Global Relationship Orb.
 *
 * Does NOT average directions or invent 50/50 for missing metrics.
 */

export const GLOBAL_RELATIONSHIP_METRIC_CODES = [
  'INITIATIVE',
  'RESPONSIVENESS',
  'RESPECT',
] as const;

export type GlobalRelationshipMetricCode =
  (typeof GLOBAL_RELATIONSHIP_METRIC_CODES)[number];

export type GlobalRelationshipShareDimensionInput = {
  code?: string | null;
  available?: boolean | null;
  direction?: string | null;
  viewerShare?: number | null;
  sampleSize?: number | null;
};

export type GlobalRelationshipShareResult =
  | {
      status: 'available';
      viewerShare: number;
      otherShare: number;
      contributingMetrics: number;
      totalSampleSize: number;
    }
  | {
      status: 'low-data';
      viewerShare: null;
      otherShare: null;
      contributingMetrics: 0;
      totalSampleSize: 0;
    };

const TARGET_CODES = new Set<string>(GLOBAL_RELATIONSHIP_METRIC_CODES);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isTargetMetric(dim: GlobalRelationshipShareDimensionInput): boolean {
  return typeof dim.code === 'string' && TARGET_CODES.has(dim.code);
}

/**
 * A metric contributes when it is publishable-enough and has a finite
 * viewerShare in 0..1. LOW_DATA / NOT_AVAILABLE / unavailable are excluded
 * (never coerced to 0.5).
 */
export function isContributingGlobalShareDimension(
  dim: GlobalRelationshipShareDimensionInput,
): boolean {
  if (dim.available === false) return false;
  const direction = dim.direction;
  if (direction === 'LOW_DATA' || direction === 'NOT_AVAILABLE') return false;
  if (!isFiniteNumber(dim.viewerShare)) return false;
  if (dim.viewerShare < 0 || dim.viewerShare > 1) return false;
  return true;
}

function lowDataResult(): GlobalRelationshipShareResult {
  return {
    status: 'low-data',
    viewerShare: null,
    otherShare: null,
    contributingMetrics: 0,
    totalSampleSize: 0,
  };
}

function availableResult(
  viewerShare: number,
  contributingMetrics: number,
  totalSampleSize: number,
): GlobalRelationshipShareResult {
  const clamped = clamp01(viewerShare);
  return {
    status: 'available',
    viewerShare: clamped,
    otherShare: clamp01(1 - clamped),
    contributingMetrics,
    totalSampleSize,
  };
}

/**
 * Aggregate overview dimensions into a single global viewer share.
 *
 * Preferred: weighted mean by sampleSize (> 0).
 * Fallback: equal mean of valid viewerShare when no positive sampleSize.
 * Empty / all excluded → low-data (no fake 0.5).
 */
export function resolveGlobalRelationshipShare(
  dimensions: readonly GlobalRelationshipShareDimensionInput[] | null | undefined,
): GlobalRelationshipShareResult {
  if (!dimensions?.length) return lowDataResult();

  const candidates = dimensions.filter(
    (dim) => isTargetMetric(dim) && isContributingGlobalShareDimension(dim),
  );

  if (candidates.length === 0) return lowDataResult();

  let weightedNumerator = 0;
  let weightedDenominator = 0;
  let equalSum = 0;

  for (const dim of candidates) {
    const share = dim.viewerShare as number;
    equalSum += share;
    const sample =
      isFiniteNumber(dim.sampleSize) && dim.sampleSize > 0
        ? dim.sampleSize
        : 0;
    if (sample > 0) {
      weightedNumerator += share * sample;
      weightedDenominator += sample;
    }
  }

  if (weightedDenominator > 0) {
    return availableResult(
      weightedNumerator / weightedDenominator,
      candidates.length,
      weightedDenominator,
    );
  }

  return availableResult(equalSum / candidates.length, candidates.length, 0);
}
