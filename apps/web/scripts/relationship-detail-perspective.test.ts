/**
 * Run: npx tsx apps/web/scripts/relationship-detail-perspective.test.ts
 */
import assert from 'node:assert/strict';
import {
  RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE,
  RELATIONSHIP_DETAIL_SECTION_TITLE,
  RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE,
  RELATIONSHIP_OVERVIEW_OTHER_CHIP,
  RELATIONSHIP_OVERVIEW_OTHER_LABEL,
  RELATIONSHIP_OVERVIEW_VIEWER_CHIP,
  RELATIONSHIP_OVERVIEW_VIEWER_LABEL,
  buildDetailPerspectiveOtherAriaLabel,
  buildDetailPerspectiveViewerAriaLabel,
  buildOverviewPerspectiveOtherAriaLabel,
  buildOverviewPerspectiveViewerAriaLabel,
  nextDetailPerspectiveForPeerChange,
} from '../src/lib/relationship-detail-perspective';

assert.equal(RELATIONSHIP_DETAIL_INITIAL_PERSPECTIVE, 'other');
assert.equal(RELATIONSHIP_OVERVIEW_INITIAL_PERSPECTIVE, 'viewer');
assert.equal(RELATIONSHIP_DETAIL_SECTION_TITLE, 'динамика отношений');
assert.equal(RELATIONSHIP_OVERVIEW_VIEWER_LABEL, 'Ты');
assert.equal(RELATIONSHIP_OVERVIEW_OTHER_LABEL, 'Люди');
assert.equal(RELATIONSHIP_OVERVIEW_VIEWER_CHIP, 'Ты →');
assert.equal(RELATIONSHIP_OVERVIEW_OTHER_CHIP, '← Люди');

assert.equal(
  buildOverviewPerspectiveViewerAriaLabel(),
  'Показать мои действия по отношению к людям',
);
assert.equal(
  buildOverviewPerspectiveOtherAriaLabel(),
  'Показать действия людей по отношению ко мне',
);

assert.equal(
  buildDetailPerspectiveViewerAriaLabel('Andrew Artales'),
  'Показать мои действия по отношению к Andrew Artales',
);
assert.equal(
  buildDetailPerspectiveOtherAriaLabel('Andrew Artales'),
  'Показать действия Andrew Artales по отношению ко мне',
);

// Visual chip copy shape (arrows are decorative; aria labels carry meaning)
assert.match(RELATIONSHIP_OVERVIEW_VIEWER_CHIP, /^Ты →$/);
assert.match(RELATIONSHIP_OVERVIEW_OTHER_CHIP, /^← Люди$/);
assert.match('Ты →', /^Ты →$/);
assert.match('← Andrew Artales', /^← Andrew Artales$/);
assert.ok('← Very Long Peer Display Name Example'.length > 10);

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
