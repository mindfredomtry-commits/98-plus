import assert from 'node:assert/strict';
import {
  resolveGlobalRelationshipShare,
  type GlobalRelationshipShareDimensionInput,
} from '../src/relationship-global-share';

function dim(
  code: string,
  viewerShare: number | null,
  opts: Partial<GlobalRelationshipShareDimensionInput> = {},
): GlobalRelationshipShareDimensionInput {
  return {
    code,
    available: true,
    direction: 'VIEWER',
    viewerShare,
    sampleSize: 10,
    ...opts,
  };
}

function assertAvailable(
  result: ReturnType<typeof resolveGlobalRelationshipShare>,
  viewerShare: number,
  extras?: { contributingMetrics?: number; totalSampleSize?: number },
) {
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.ok(Math.abs(result.viewerShare - viewerShare) < 1e-9);
  assert.ok(Math.abs(result.otherShare - (1 - viewerShare)) < 1e-9);
  if (extras?.contributingMetrics != null) {
    assert.equal(result.contributingMetrics, extras.contributingMetrics);
  }
  if (extras?.totalSampleSize != null) {
    assert.equal(result.totalSampleSize, extras.totalSampleSize);
  }
}

// Equal sampleSize → simple mean
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.5),
    dim('RESPONSIVENESS', 0.5),
    dim('RESPECT', 0.5),
  ]),
  0.5,
  { contributingMetrics: 3, totalSampleSize: 30 },
);

assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.6),
    dim('RESPONSIVENESS', 0.6),
    dim('RESPECT', 0.6),
  ]),
  0.6,
);

assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.6),
    dim('RESPONSIVENESS', 0.5),
    dim('RESPECT', 0.4),
  ]),
  0.5,
);

// Weighted by sampleSize
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.6, { sampleSize: 100 }),
    dim('RESPONSIVENESS', 0.4, { sampleSize: 10 }),
    dim('RESPECT', null, { available: false, direction: 'LOW_DATA' }),
  ]),
  (0.6 * 100 + 0.4 * 10) / 110,
  { contributingMetrics: 2, totalSampleSize: 110 },
);

// LOW_DATA excluded
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.55, { direction: 'LOW_DATA', sampleSize: 2 }),
    dim('RESPONSIVENESS', 0.6),
    dim('RESPECT', 0.4),
  ]),
  0.5,
  { contributingMetrics: 2, totalSampleSize: 20 },
);

// Two unavailable + one valid
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', null, { available: false, direction: 'NOT_AVAILABLE' }),
    dim('RESPONSIVENESS', 0.7, {
      available: false,
      direction: 'LOW_DATA',
      sampleSize: 0,
    }),
    dim('RESPECT', 0.7),
  ]),
  0.7,
  { contributingMetrics: 1, totalSampleSize: 10 },
);

// Equal-mean fallback when sampleSize missing / 0
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.6, { sampleSize: 0 }),
    dim('RESPONSIVENESS', 0.4, { sampleSize: null }),
    dim('RESPECT', 0.5, { sampleSize: undefined }),
  ]),
  0.5,
  { contributingMetrics: 3, totalSampleSize: 0 },
);

// All unavailable / LOW_DATA
{
  const result = resolveGlobalRelationshipShare([
    dim('INITIATIVE', 0.5, { direction: 'LOW_DATA' }),
    dim('RESPONSIVENESS', null, { available: false }),
    dim('RESPECT', 0.5, { direction: 'NOT_AVAILABLE' }),
  ]);
  assert.equal(result.status, 'low-data');
  assert.equal(result.viewerShare, null);
  assert.equal(result.otherShare, null);
  assert.equal(result.contributingMetrics, 0);
  assert.equal(result.totalSampleSize, 0);
}

// Empty / null input
assert.equal(resolveGlobalRelationshipShare([]).status, 'low-data');
assert.equal(resolveGlobalRelationshipShare(null).status, 'low-data');
assert.equal(resolveGlobalRelationshipShare(undefined).status, 'low-data');

// Invalid NaN / out-of-range ignored
{
  const result = resolveGlobalRelationshipShare([
    dim('INITIATIVE', Number.NaN),
    dim('RESPONSIVENESS', 1.5),
    dim('RESPECT', -0.1),
  ]);
  assert.equal(result.status, 'low-data');
}

// Non-target codes ignored even if valid
assertAvailable(
  resolveGlobalRelationshipShare([
    dim('UNKNOWN', 0.9, { sampleSize: 1000 }),
    dim('INITIATIVE', 0.4),
    dim('RESPONSIVENESS', 0.6),
    dim('RESPECT', 0.5),
  ]),
  0.5,
  { contributingMetrics: 3 },
);

// Clamp is applied to weighted result that lands in range (already 0..1 inputs)
assertAvailable(
  resolveGlobalRelationshipShare([dim('INITIATIVE', 0), dim('RESPECT', 1)]),
  0.5,
);

console.log('relationship-global-share.test.ts: ok');
