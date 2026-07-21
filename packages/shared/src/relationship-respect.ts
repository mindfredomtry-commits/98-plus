/**
 * Relationship ORB — RESPECT metric.
 *
 * Linear scores (internal) → resolveRelativeMetric → public shares.
 * Direction threshold is NOT computed here (SQL PROD GATE).
 *
 * Outcomes (confirmed from app code):
 *   completed → BOTH_YES
 *   failed    → BOTH_NO
 *   overboard → OVERBOARD
 *   SPLIT / TIMEOUT / BanStatus.FAILED → excluded
 */

import {
  resolveRelativeMetric,
  type RelativeMetricReasonCode,
} from './relationship-relative-metric';

export type RespectOutcomeCounts = {
  completed: number;
  failed: number;
  overboard: number;
};

export type RespectRelativeShares = {
  available: true;
  viewerShare: number;
  otherShare: number;
  viewerRespectScore: number;
  otherRespectScore: number;
  viewerSampleSize: number;
  otherSampleSize: number;
  reasonCode: 'AVAILABLE';
  directionHint: null;
};

export type RespectUnavailable = {
  available: false;
  viewerShare: null;
  otherShare: null;
  viewerRespectScore: number | null;
  otherRespectScore: number | null;
  viewerSampleSize: number;
  otherSampleSize: number;
  reasonCode: RelativeMetricReasonCode | 'MISSING_SAMPLE';
  directionHint: 'NOT_AVAILABLE';
};

export type RespectMetricResult = RespectRelativeShares | RespectUnavailable;

export type RespectPublicDirection =
  | 'VIEWER'
  | 'OTHER'
  | 'BALANCED'
  | 'LOW_DATA'
  | 'NOT_AVAILABLE';

function nonNegInt(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Sample size for one direction: completed + failed + overboard. */
export function respectSampleSize(counts: RespectOutcomeCounts): number {
  return (
    nonNegInt(counts.completed) +
    nonNegInt(counts.failed) +
    nonNegInt(counts.overboard)
  );
}

/**
 * Linear respect score, or null when there are no terminal observations.
 * Never coalesces empty → 0.
 */
export function respectScore(counts: RespectOutcomeCounts): number | null {
  const completed = nonNegInt(counts.completed);
  const failed = nonNegInt(counts.failed);
  const overboard = nonNegInt(counts.overboard);
  const sample = completed + failed + overboard;
  if (sample <= 0) return null;
  return completed / sample;
}

/**
 * Respect pipeline: linear scores → shared relative helper.
 */
export function computeRespectMetric(
  viewerCounts: RespectOutcomeCounts,
  otherCounts: RespectOutcomeCounts,
): RespectMetricResult {
  const viewerSampleSize = respectSampleSize(viewerCounts);
  const otherSampleSize = respectSampleSize(otherCounts);
  const viewerRespectScore = respectScore(viewerCounts);
  const otherRespectScore = respectScore(otherCounts);

  if (viewerSampleSize <= 0 || otherSampleSize <= 0) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      viewerRespectScore,
      otherRespectScore,
      viewerSampleSize,
      otherSampleSize,
      reasonCode: 'MISSING_SAMPLE',
      directionHint: 'NOT_AVAILABLE',
    };
  }

  const relative = resolveRelativeMetric(
    viewerRespectScore,
    otherRespectScore,
  );

  if (!relative.available) {
    return {
      available: false,
      viewerShare: null,
      otherShare: null,
      viewerRespectScore,
      otherRespectScore,
      viewerSampleSize,
      otherSampleSize,
      reasonCode: relative.reasonCode,
      directionHint: 'NOT_AVAILABLE',
    };
  }

  return {
    available: true,
    viewerShare: relative.viewerShare,
    otherShare: relative.otherShare,
    viewerRespectScore: viewerRespectScore as number,
    otherRespectScore: otherRespectScore as number,
    viewerSampleSize,
    otherSampleSize,
    reasonCode: 'AVAILABLE',
    directionHint: null,
  };
}

/** Display percent from relative viewerShare (not linear score). */
export function formatRespectViewerSharePercent(
  viewerShare: number | null | undefined,
): string | null {
  if (viewerShare == null || !Number.isFinite(viewerShare)) return null;
  const pct = Math.round(Math.min(1, Math.max(0, viewerShare)) * 100);
  return `${pct}%`;
}

/**
 * Factual UI copy for Respect — no evaluative language.
 * Direction must already match the shared INITIATIVE/RESPONSIVENESS helper.
 */
export function respectUiDescription(
  direction: string | null | undefined,
  peerDisplayName: string,
): string | null {
  const peer = peerDisplayName.trim() || 'собеседник';
  switch (direction) {
    case 'BALANCED':
      return 'Вы примерно одинаково относитесь к запретам друг друга.';
    case 'VIEWER':
      return 'Показатель уважения смещён в твою сторону.';
    case 'OTHER':
      return `Показатель уважения смещён в сторону ${peer}.`;
    default:
      return null;
  }
}

/**
 * Public relationshipScreen dimension — no absolute scores or outcome counts.
 * `direction` must be supplied by the same helper as INITIATIVE/RESPONSIVENESS.
 */
export function buildRespectPublicDimension(input: {
  metric: RespectMetricResult;
  direction: RespectPublicDirection;
  peerDisplayName: string;
}): Record<string, unknown> {
  const { metric, direction, peerDisplayName } = input;

  if (!metric.available || direction === 'NOT_AVAILABLE' || direction === 'LOW_DATA') {
    return {
      code: 'RESPECT',
      ring: 'INNER',
      title: 'Уважение',
      available: false,
      viewerShare: null,
      otherShare: null,
      displayValue: null,
      direction: direction === 'LOW_DATA' ? 'LOW_DATA' : 'NOT_AVAILABLE',
      description: null,
      sampleSize: null,
      viewerSampleSize: metric.viewerSampleSize,
      otherSampleSize: metric.otherSampleSize,
    };
  }

  const displayValue = formatRespectViewerSharePercent(metric.viewerShare);
  return {
    code: 'RESPECT',
    ring: 'INNER',
    title: 'Уважение',
    available: true,
    viewerShare: metric.viewerShare,
    otherShare: metric.otherShare,
    displayValue,
    direction,
    description: respectUiDescription(direction, peerDisplayName),
    sampleSize: metric.viewerSampleSize + metric.otherSampleSize,
    viewerSampleSize: metric.viewerSampleSize,
    otherSampleSize: metric.otherSampleSize,
  };
}

/** Assert public payload never leaks absolute scores / outcome counts. */
export function assertRespectPublicDimensionSafe(
  dim: Record<string, unknown>,
): void {
  const banned = [
    'viewerRespectScore',
    'otherRespectScore',
    'viewer_completed_count',
    'viewerCompleted',
    'viewer_failed_count',
    'viewerFailed',
    'viewer_overboard_count',
    'viewerOverboard',
    'other_completed_count',
    'otherCompleted',
    'other_failed_count',
    'otherFailed',
    'other_overboard_count',
    'otherOverboard',
    'reasonCode',
    'reason_code',
  ];
  for (const key of banned) {
    if (key in dim) {
      throw new Error(`Respect public dimension must not include ${key}`);
    }
  }
  if (!('viewerShare' in dim) || !('otherShare' in dim)) {
    throw new Error('Respect public dimension must include viewerShare/otherShare');
  }
}
