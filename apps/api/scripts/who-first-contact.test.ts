/**
 * WHO native first-contact — API resolution contract tests (no DB).
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/who-first-contact.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeUsersShared } from '../src/services/who-first-contact-parse';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHO FIRST-CONTACT (API) ===\n');

{
  const n = normalizeUsersShared({
    request_id: 42,
    users: [
      {
        user_id: 946723994,
        first_name: 'Ada',
        username: 'ada',
        photo: [{ file_id: 'x' }],
      },
    ],
  });
  assert.equal(n?.request_id, 42);
  assert.equal(n?.users[0]?.user_id, 946723994);
  assert.equal(n?.users[0]?.username, 'ada');
  pass('normalizeUsersShared parses request_id + user');
}

{
  assert.equal(normalizeUsersShared(null), null);
  assert.equal(normalizeUsersShared({ users: [] }), null);
  pass('normalizeUsersShared rejects empty/invalid');
}

{
  const svc = read('src/services/who-first-contact.service.ts');
  assert.match(svc, /source:\s*'WHO_FIRST_CONTACT'/);
  assert.match(svc, /status:\s*'processing'/);
  assert.match(svc, /duplicate users_shared ignored/);
  assert.match(svc, /errorMessage:\s*'self'/);
  assert.match(svc, /status:\s*'unregistered'/);
  assert.match(svc, /status:\s*'registered'/);
  assert.doesNotMatch(svc, /BanInvite|createBanInvite|banInvite/);
  assert.match(svc, /savePreparedKeyboardButton/);
  assert.match(svc, /request_name:\s*true/);
  assert.match(svc, /request_username:\s*true/);
  assert.match(svc, /request_photo:\s*true/);
  assert.match(svc, /max_quantity:\s*1/);
  assert.match(svc, /user_is_bot:\s*false/);
  assert.match(svc, /type:\s*'who:first-contact'/);
  assert.match(svc, /Открыть 98\+/);
  pass('Service: SocialContact WHO_FIRST_CONTACT, no BanInvite, claim, WS, return button');
}

{
  const routes = read('src/routes/who-first-contact.ts');
  const beginIdx = routes.indexOf("post('/begin'");
  const consumeIdx = routes.indexOf("post('/consume'");
  const idIdx = routes.indexOf("get('/:id'");
  assert.ok(beginIdx >= 0 && consumeIdx > beginIdx && idIdx > consumeIdx);
  pass('Routes: /consume registered before /:id');
}

{
  const bot = read('src/bot/index.ts');
  assert.match(bot, /handleWhoFirstContactUsersShared/);
  assert.match(bot, /users_shared/);
  assert.match(bot, /sendBotKeyboardForFirstContact/);
  assert.match(bot, /wfc_/);
  pass('Bot: users_shared + wfc_pick keyboard');
}

{
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /model WhoFirstContactRequest/);
  assert.match(schema, /telegramRequestId/);
  assert.match(schema, /preparedButtonId/);
  assert.match(schema, /consumedAt/);
  pass('Prisma WhoFirstContactRequest model present');
}

{
  const mig = read(
    'prisma/migrations/20260728233000_who_first_contact/migration.sql',
  );
  assert.match(mig, /CREATE TABLE IF NOT EXISTS "WhoFirstContactRequest"/);
  pass('Migration SQL present');
}

{
  const social = read('src/services/social-graph.service.ts');
  assert.match(social, /WHO_FIRST_CONTACT/);
  pass('SocialSource includes WHO_FIRST_CONTACT');
}

console.log(`\n=== ${passed} passed ===\n`);
