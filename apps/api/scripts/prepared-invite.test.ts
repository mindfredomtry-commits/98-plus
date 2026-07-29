/**
 * Prepared invite-ban (KNOWN_BY_SENDER) API contract.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/prepared-invite.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== PREPARED INVITE API ===\n');

const schema = read('prisma/schema.prisma');
const migration = read(
  'prisma/migrations/20260729093000_prepared_invite_recipient/migration.sql',
);
const inviteSvc = read('src/services/invite.service.ts');
const banSvc = read('src/services/ban.service.ts');
const bansRoute = read('src/routes/bans.ts');
const social = read('src/services/social-graph.service.ts');

{
  assert.match(schema, /recipientMode\s+BanInviteRecipientMode/);
  assert.match(schema, /KNOWN_BY_SENDER/);
  assert.match(schema, /clientRequestId\s+String\?/);
  assert.match(schema, /targetUsername\s+String\?/);
  assert.match(schema, /@@unique\(\[senderId, clientRequestId\]\)/);
  assert.match(migration, /BanInviteRecipientMode/);
  assert.match(migration, /clientRequestId/);
  pass('Schema + migration support prepared invites');
}

{
  assert.match(inviteSvc, /export async function createPreparedInviteOnce/);
  assert.match(inviteSvc, /recipientMode: BanInviteRecipientMode\.KNOWN_BY_SENDER/);
  assert.match(inviteSvc, /targetUsername: null/);
  assert.match(inviteSvc, /clientRequestId: params\.clientRequestId/);
  assert.doesNotMatch(
    inviteSvc.slice(
      inviteSvc.indexOf('export async function createPreparedInviteOnce'),
      inviteSvc.indexOf('export async function claimInvitesForUser'),
    ),
    /recordSocialContact|sendPendingBanInviteToUser/,
  );
  pass('createPreparedInviteOnce skips SocialContact + bot DM');
}

{
  assert.match(inviteSvc, /P2002/);
  assert.match(inviteSvc, /created: false/);
  assert.match(banSvc, /COMPOSE_RECIPIENT_MODES\.KNOWN_BY_SENDER/);
  assert.match(banSvc, /findPreparedInviteByClientRequestId/);
  assert.match(bansRoute, /recipientMode/);
  assert.match(bansRoute, /clientRequestId/);
  pass('Idempotent create + /bans/send recipientMode branch');
}

{
  assert.match(
    banSvc,
    /BACKEND PREPARED INVITE BAN/,
  );
  assert.match(
    banSvc,
    /prepared: true[\s\S]*requiresShare: true/,
  );
  assert.doesNotMatch(
    banSvc.slice(
      banSvc.indexOf("params.recipientMode === COMPOSE_RECIPIENT_MODES.KNOWN_BY_SENDER"),
      banSvc.indexOf('assertCanSendBan(await canSendBan(senderId));'),
    ),
    /prisma\.ban\.create/,
  );
  pass('Prepared path creates invite, not direct Ban');
}

{
  assert.match(social, /if \(!inv\.targetUsername && !inv\.claimedById\) continue/);
  assert.match(social, /if \(!inv\.targetUsername\) continue/);
  pass('Social graph skips null-target prepared invites until claim');
}

console.log(`\n=== ${passed} passed ===\n`);
