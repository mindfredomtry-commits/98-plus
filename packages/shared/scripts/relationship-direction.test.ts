import assert from 'node:assert/strict';
import {
  RELATIONSHIP_BALANCE_MAX,
  RELATIONSHIP_BALANCE_MIN,
  resolveRelationshipMetricDirection,
} from '../src/relationship-direction';

assert.equal(RELATIONSHIP_BALANCE_MIN, 49);
assert.equal(RELATIONSHIP_BALANCE_MAX, 51);

assert.equal(resolveRelationshipMetricDirection(0.48), 'OTHER');
assert.equal(resolveRelationshipMetricDirection(0.49), 'BALANCED');
assert.equal(resolveRelationshipMetricDirection(0.5), 'BALANCED');
assert.equal(resolveRelationshipMetricDirection(0.51), 'BALANCED');
assert.equal(resolveRelationshipMetricDirection(0.52), 'VIEWER');
assert.equal(resolveRelationshipMetricDirection(0.63), 'VIEWER');
assert.equal(resolveRelationshipMetricDirection(0.37), 'OTHER');
assert.equal(resolveRelationshipMetricDirection(null), 'LOW_DATA');
assert.equal(resolveRelationshipMetricDirection(undefined), 'LOW_DATA');

console.log('relationship-direction.test.ts: ok');
