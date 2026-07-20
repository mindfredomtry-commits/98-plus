/**
 * Run: npx tsx apps/web/scripts/relationship-dimensions-v8.test.ts
 */
import assert from 'node:assert/strict';
import {
  normalizeOrbDimensions,
  normalizeRelationshipDimension,
  resolveLearnPressView,
  selectCardDimensions,
  selectOrbRingDimensions,
} from '../src/lib/relationship-dimensions';

function dimFixture(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    code: 'INITIATIVE',
    ring: 'OUTER',
    available: true,
    publishable: true,
    viewerShare: 0.5,
    otherShare: 0.5,
    displayValue: '50%',
    direction: 'BALANCED',
    title: 'Инициатива',
    description: 'balanced initiative',
    confidenceCode: 'VERY_HIGH',
    confidenceScore: 0.95,
    sampleSize: 100,
    metricCode: 'initiative_share',
    resultCode: 'BALANCED',
    ...overrides,
  };
}

// CASE 1 — three dimensions in correct ring order
{
  const dims = normalizeOrbDimensions([
    dimFixture({
      code: 'RESPECT',
      ring: 'INNER',
      title: 'Уважение',
      displayValue: '58%',
      direction: 'VIEWER',
      viewerShare: 0.58,
      metricCode: 'respect_share',
    }),
    dimFixture({ code: 'RESPONSIVENESS', ring: 'MIDDLE', title: 'Ответность', displayValue: '54%', viewerShare: 0.54, metricCode: 'responsiveness_share' }),
    dimFixture({ code: 'INITIATIVE', ring: 'OUTER', title: 'Инициатива', displayValue: '50%' }),
  ]);

  assert.equal(dims.length, 3);
  assert.deepEqual(
    dims.map((d) => d.code),
    ['INITIATIVE', 'RESPONSIVENESS', 'RESPECT'],
  );
  assert.deepEqual(
    dims.map((d) => d.ring),
    ['OUTER', 'MIDDLE', 'INNER'],
  );

  const orb = selectOrbRingDimensions(dims);
  const cards = selectCardDimensions(dims);
  assert.equal(orb.length, 3);
  assert.equal(cards.length, 3);
  const respect = cards.find((d) => d.code === 'RESPECT');
  assert.equal(respect?.displayValue, '58%');
  assert.equal(respect?.ring, 'INNER');
}

// CASE 2 — only two dimensions
{
  const dims = normalizeOrbDimensions([
    dimFixture({ code: 'RESPONSIVENESS', ring: 'MIDDLE' }),
    dimFixture({ code: 'INITIATIVE', ring: 'OUTER' }),
  ]);
  assert.equal(selectOrbRingDimensions(dims).length, 2);
  assert.equal(
    normalizeRelationshipDimension(
      dimFixture({ code: 'THIRD_DIMENSION_PENDING', ring: 'INNER' }),
    ),
    null,
  );
}

// CASE 3 — RESPECT low data
{
  const respect = normalizeRelationshipDimension(
    dimFixture({
      code: 'RESPECT',
      ring: 'INNER',
      available: false,
      publishable: false,
      viewerShare: null,
      otherShare: null,
      displayValue: null,
      direction: 'LOW_DATA',
      title: 'Уважение',
      description: 'Пока недостаточно данных',
    }),
  );
  assert.ok(respect);
  assert.equal(respect.displayValue, null);
  assert.equal(respect.direction, 'LOW_DATA');
  const cards = selectCardDimensions([respect!]);
  assert.equal(cards.length, 1);
  assert.notEqual(cards[0]?.displayValue, 'null%');
}

// CASE 4 — wrong order → sorted by ring
{
  const dims = normalizeOrbDimensions([
    dimFixture({ code: 'RESPECT', ring: 'INNER' }),
    dimFixture({ code: 'INITIATIVE', ring: 'OUTER' }),
    dimFixture({ code: 'RESPONSIVENESS', ring: 'MIDDLE' }),
  ]);
  assert.deepEqual(
    dims.map((d) => d.ring),
    ['OUTER', 'MIDDLE', 'INNER'],
  );
}

// CASE 5 — premium=false
{
  assert.equal(resolveLearnPressView(false), 'premium');
}

// CASE 6 — premium=true
{
  assert.equal(resolveLearnPressView(true), 'peerSelect');
}

console.log('relationship-dimensions-v8.test.ts: ok');
