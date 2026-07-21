/**
 * Run: npx tsx packages/shared/scripts/relationship-respect.test.ts
 */
import assert from 'node:assert/strict';
import {
  assertRespectPublicDimensionSafe,
  buildRespectPublicDimension,
  computeRespectMetric,
  formatRespectViewerSharePercent,
  respectSampleSize,
  respectScore,
  respectUiDescription,
} from '../src/relationship-respect';

// CASE 1: 0.78 / 0.54 → relative shares via shared helper
{
  const r = computeRespectMetric(
    { completed: 78, failed: 22, overboard: 0 },
    { completed: 54, failed: 46, overboard: 0 },
  );
  assert.equal(r.available, true);
  if (r.available) {
    assert.ok(Math.abs(r.viewerShare - 0.590909) < 1e-5);
    assert.ok(Math.abs(r.otherShare - 0.409091) < 1e-5);
    assert.ok(Math.abs(r.viewerRespectScore - 0.78) < 1e-9);
    assert.ok(Math.abs(r.otherRespectScore - 0.54) < 1e-9);
    assert.equal(r.reasonCode, 'AVAILABLE');
  }
}

{
  const viewerScore = 0.78;
  const otherScore = 0.54;
  const sum = viewerScore + otherScore;
  assert.ok(Math.abs(viewerScore / sum - 0.5909090909) < 1e-9);
}

// CASE 2
{
  const r = computeRespectMetric(
    { completed: 50, failed: 50, overboard: 0 },
    { completed: 10, failed: 10, overboard: 0 },
  );
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0.5);
    assert.equal(r.otherShare, 0.5);
  }
}

// CASE 3
{
  const r = computeRespectMetric(
    { completed: 90, failed: 10, overboard: 0 },
    { completed: 30, failed: 70, overboard: 0 },
  );
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0.75);
    assert.equal(r.otherShare, 0.25);
  }
}

// CASE 4
{
  assert.equal(respectScore({ completed: 20, failed: 70, overboard: 10 }), 0.2);
  assert.equal(
    respectSampleSize({ completed: 20, failed: 70, overboard: 10 }),
    100,
  );
}

// CASE 5: one-side missing sample
{
  const r = computeRespectMetric(
    { completed: 5, failed: 1, overboard: 0 },
    { completed: 0, failed: 0, overboard: 0 },
  );
  assert.equal(r.available, false);
  assert.equal(r.viewerShare, null);
  assert.equal(r.otherShare, null);
  assert.equal(r.reasonCode, 'MISSING_SAMPLE');
  assert.ok(r.viewerRespectScore != null);
  assert.equal(r.otherRespectScore, null);
}

// CASE 6: both empty
{
  const r = computeRespectMetric(
    { completed: 0, failed: 0, overboard: 0 },
    { completed: 0, failed: 0, overboard: 0 },
  );
  assert.equal(r.available, false);
  assert.equal(r.viewerShare, null);
  assert.equal(respectScore({ completed: 0, failed: 0, overboard: 0 }), null);
}

// Display from relative share
{
  assert.equal(formatRespectViewerSharePercent(0.590909), '59%');
  assert.equal(formatRespectViewerSharePercent(null), null);
}

// CASE 7: both scores 0 with sample > 0 → unavailable
{
  const r = computeRespectMetric(
    { completed: 0, failed: 5, overboard: 5 },
    { completed: 0, failed: 3, overboard: 2 },
  );
  assert.equal(r.available, false);
  assert.equal(r.viewerShare, null);
  assert.equal(r.otherShare, null);
  assert.equal(r.viewerRespectScore, 0);
  assert.equal(r.otherRespectScore, 0);
  assert.equal(r.reasonCode, 'ZERO_TOTAL_SCORE');
  assert.equal(r.directionHint, 'NOT_AVAILABLE');
}

// CASE 7b: one-side zero score (other has positives) → available 0/1
{
  const r = computeRespectMetric(
    { completed: 0, failed: 4, overboard: 1 },
    { completed: 8, failed: 2, overboard: 0 },
  );
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0);
    assert.equal(r.otherShare, 1);
  }
}

// CASE 8: near-equality — direction NOT decided in TS (SQL PROD GATE)
{
  assert.equal(0.5001 === 0.4999, false);
}

// CASE 9: VIEWER description ≠ balanced
{
  const desc = respectUiDescription('VIEWER', 'Andrew');
  assert.equal(desc, 'Показатель уважения смещён в твою сторону.');
  assert.equal(desc?.includes('примерно одинаково'), false);
  assert.equal(
    respectUiDescription('OTHER', 'Andrew'),
    'Показатель уважения смещён в сторону Andrew.',
  );
}

// CASE 10: public JSON has shares, no absolute scores
{
  const metric = computeRespectMetric(
    { completed: 78, failed: 22, overboard: 0 },
    { completed: 54, failed: 46, overboard: 0 },
  );
  assert.equal(metric.available, true);
  const pub = buildRespectPublicDimension({
    metric,
    direction: 'VIEWER',
    peerDisplayName: 'Andrew',
  });
  assertRespectPublicDimensionSafe(pub);
  assert.equal(pub.code, 'RESPECT');
  assert.ok(typeof pub.viewerShare === 'number');
  assert.equal('viewerRespectScore' in pub, false);
  assert.equal('reasonCode' in pub, false);
}

console.log('[relationship-respect.test] all cases passed');
