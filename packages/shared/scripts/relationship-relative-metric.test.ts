/**
 * Run: npx tsx packages/shared/scripts/relationship-relative-metric.test.ts
 */
import assert from 'node:assert/strict';
import { resolveRelativeMetric } from '../src/relationship-relative-metric';

// CASE 1
{
  const r = resolveRelativeMetric(0.78, 0.54);
  assert.equal(r.available, true);
  if (r.available) {
    assert.ok(Math.abs(r.viewerShare - 0.590909) < 1e-5);
    assert.ok(Math.abs(r.otherShare - 0.409091) < 1e-5);
    assert.equal(r.reasonCode, 'AVAILABLE');
  }
}

// CASE 2 — scale-invariant equal
{
  const r = resolveRelativeMetric(50, 50);
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0.5);
    assert.equal(r.otherShare, 0.5);
  }
}

// CASE 3
{
  const r = resolveRelativeMetric(90, 30);
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0.75);
    assert.equal(r.otherShare, 0.25);
  }
}

// CASE 4 — missing
{
  const r = resolveRelativeMetric(null, 0.5);
  assert.equal(r.available, false);
  assert.equal(r.viewerShare, null);
  assert.equal(r.otherShare, null);
  assert.equal(r.reasonCode, 'MISSING_DIRECTION_DATA');
}

// CASE 5 — zero total
{
  const r = resolveRelativeMetric(0, 0);
  assert.equal(r.available, false);
  assert.equal(r.reasonCode, 'ZERO_TOTAL_SCORE');
}

// CASE 6 — one-side zero
{
  const r = resolveRelativeMetric(0, 0.8);
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0);
    assert.equal(r.otherShare, 1);
  }
}

// CASE 7
{
  const r = resolveRelativeMetric(0.8, 0);
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 1);
    assert.equal(r.otherShare, 0);
  }
}

// CASE 8 — negative invalid
{
  const r = resolveRelativeMetric(-0.1, 0.8);
  assert.equal(r.available, false);
  assert.equal(r.reasonCode, 'INVALID_NEGATIVE_SCORE');
}

// CASE 9 — tiny positives
{
  const r = resolveRelativeMetric(0.0000001, 0.0000001);
  assert.equal(r.available, true);
  if (r.available) {
    assert.equal(r.viewerShare, 0.5);
    assert.equal(r.otherShare, 0.5);
  }
}

// CASE 10 — sum ≈ 1
{
  const r = resolveRelativeMetric(0.78, 0.54);
  assert.equal(r.available, true);
  if (r.available) {
    assert.ok(Math.abs(r.viewerShare + r.otherShare - 1) < 1e-12);
  }
}

// Scale equivalence 0.78/0.54 ≡ 78/54
{
  const a = resolveRelativeMetric(0.78, 0.54);
  const b = resolveRelativeMetric(78, 54);
  assert.equal(a.available, true);
  assert.equal(b.available, true);
  if (a.available && b.available) {
    assert.ok(Math.abs(a.viewerShare - b.viewerShare) < 1e-12);
    assert.ok(Math.abs(a.otherShare - b.otherShare) < 1e-12);
  }
}

console.log('[relationship-relative-metric.test] all cases passed');
