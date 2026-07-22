/**
 * Run: npx tsx apps/web/scripts/relationship-detail-perspective.test.ts
 */
import assert from 'node:assert/strict';
import {
  RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE,
  RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE,
  nextDetailPerspectiveForPeerChange,
} from '../src/lib/relationship-detail-perspective';

assert.equal(RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE, 'other');
assert.equal(RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE, 'viewer');

// Same peer (range / refetch) keeps viewer choice
assert.equal(
  nextDetailPerspectiveForPeerChange('viewer', 'peer-a', 'peer-a'),
  'viewer',
);
assert.equal(
  nextDetailPerspectiveForPeerChange('other', 'peer-a', 'peer-a'),
  'other',
);

// Peer id change resets to other
assert.equal(
  nextDetailPerspectiveForPeerChange('viewer', 'peer-a', 'peer-b'),
  'other',
);
assert.equal(
  nextDetailPerspectiveForPeerChange('other', 'peer-a', 'peer-b'),
  'other',
);

// Empty / missing ids do not force a reset mid-session
assert.equal(
  nextDetailPerspectiveForPeerChange('viewer', 'peer-a', ''),
  'viewer',
);
assert.equal(
  nextDetailPerspectiveForPeerChange('viewer', '', 'peer-b'),
  'viewer',
);

console.log('relationship-detail-perspective.test.ts: ok');
