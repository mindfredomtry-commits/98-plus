/**
 * Run: npx tsx apps/web/scripts/relationship-orb-center-identity.test.ts
 */
import assert from 'node:assert/strict';
import {
  hasSwitchableOrbCenterIdentities,
  relationshipOrbIdentityLetter,
  resolveRelationshipOrbCenterIdentity,
  type RelationshipOrbCenterIdentity,
} from '../src/lib/relationship-orb-center-identity';

const viewer: RelationshipOrbCenterIdentity = {
  avatarUrl: 'https://cdn.example/viewer.jpg',
  displayName: 'Drew',
  alt: 'Ты',
};

const other: RelationshipOrbCenterIdentity = {
  avatarUrl: 'https://cdn.example/andrew.jpg',
  displayName: 'Andrew',
  alt: 'Andrew',
};

const viewerNoPhoto: RelationshipOrbCenterIdentity = {
  avatarUrl: null,
  displayName: 'Drew',
  alt: 'Ты',
};

const otherNoPhoto: RelationshipOrbCenterIdentity = {
  avatarUrl: null,
  displayName: 'Andrew',
  alt: 'Andrew',
};

assert.equal(hasSwitchableOrbCenterIdentities(viewer, other), true);
assert.equal(hasSwitchableOrbCenterIdentities(viewer, null), false);
assert.equal(hasSwitchableOrbCenterIdentities(undefined, other), false);

{
  const active = resolveRelationshipOrbCenterIdentity(
    'viewer',
    viewer,
    other,
  );
  assert.equal(active.avatarUrl, viewer.avatarUrl);
  assert.equal(active.alt, 'Ты');
}

{
  const active = resolveRelationshipOrbCenterIdentity('other', viewer, other);
  assert.equal(active.avatarUrl, other.avatarUrl);
  assert.equal(active.displayName, 'Andrew');
}

{
  const active = resolveRelationshipOrbCenterIdentity(
    'viewer',
    viewerNoPhoto,
    other,
  );
  assert.equal(active.avatarUrl, null);
  assert.equal(relationshipOrbIdentityLetter(active), 'D');
}

{
  const active = resolveRelationshipOrbCenterIdentity(
    'other',
    viewer,
    otherNoPhoto,
  );
  assert.equal(active.avatarUrl, null);
  assert.equal(relationshipOrbIdentityLetter(active), 'A');
}

// Overview / legacy: only peerAvatar fallback — perspective must not invent other
{
  const legacy: RelationshipOrbCenterIdentity = {
    avatarUrl: 'https://cdn.example/overview-self.jpg',
    displayName: 'Drew',
    alt: 'Ты',
  };
  const activeOther = resolveRelationshipOrbCenterIdentity(
    'other',
    null,
    null,
    legacy,
  );
  assert.equal(activeOther.avatarUrl, legacy.avatarUrl);
  assert.equal(
    hasSwitchableOrbCenterIdentities(null, null),
    false,
  );
}

console.log('relationship-orb-center-identity.test.ts: ok');
