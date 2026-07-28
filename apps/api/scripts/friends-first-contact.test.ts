/**
 * WHO first-contact v1 — API contract + validation.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/friends-first-contact.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FirstContactError,
  parseFirstContactUsername,
  TELEGRAM_USERNAME_RE,
  FIRST_CONTACT_RATE_LIMIT_PER_MINUTE,
} from '../src/services/friends-first-contact-parse';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== FRIENDS FIRST-CONTACT ===\n');

// —— Validation: invalid username rejected ——
{
  assert.throws(
    () => parseFirstContactUsername(''),
    (e: unknown) =>
      e instanceof FirstContactError && e.code === 'invalid_username',
  );
  assert.throws(
    () => parseFirstContactUsername('ab'),
    (e: unknown) =>
      e instanceof FirstContactError && e.code === 'invalid_username',
  );
  assert.throws(
    () => parseFirstContactUsername('1abcde'),
    (e: unknown) =>
      e instanceof FirstContactError && e.code === 'invalid_username',
  );
  assert.throws(
    () => parseFirstContactUsername('bad name'),
    (e: unknown) =>
      e instanceof FirstContactError && e.code === 'invalid_username',
  );
  pass('Invalid username rejected');
}

// —— Validation: normalize trim / @ ——
{
  assert.equal(parseFirstContactUsername('  @JustDim  '), 'justdim');
  assert.equal(parseFirstContactUsername('Ninety_eight_pluss_Bot'), 'ninety_eight_pluss_bot');
  assert.ok(TELEGRAM_USERNAME_RE.test('justdim'));
  pass('Username trim + @ strip + lowercase');
}

// —— Source + route contract ——
{
  const serviceSrc = read('src/services/friends-first-contact.service.ts');
  const routeSrc = read('src/routes/friends.ts');
  const graphSrc = read('src/services/social-graph.service.ts');

  assert.match(graphSrc, /WHO_FIRST_CONTACT/);
  assert.match(serviceSrc, /source:\s*'WHO_FIRST_CONTACT'/);
  assert.match(serviceSrc, /recordSocialContact/);
  assert.doesNotMatch(serviceSrc, /createPendingInvite/);
  assert.doesNotMatch(serviceSrc, /prisma\.banInvite/);
  assert.match(routeSrc, /friendsRouter\.post\('\/first-contact'/);
  assert.match(serviceSrc, /status:\s*'unregistered'/);
  assert.match(serviceSrc, /status:\s*'registered'/);
  assert.match(serviceSrc, /alreadyInGraph/);
  assert.match(serviceSrc, /assertFirstContactRateLimit/);
  assert.equal(FIRST_CONTACT_RATE_LIMIT_PER_MINUTE, 20);
  assert.match(serviceSrc, /listSocialGraph/);
  assert.match(serviceSrc, /sanitizeFriendCard/);
  assert.doesNotMatch(serviceSrc, /syncSocialGraphFromHistory/);
  pass('Registered path uses WHO_FIRST_CONTACT; no BanInvite; rate limit; FriendCard via listSocialGraph');
}

// —— Unregistered: no SocialContact write before return ——
{
  const serviceSrc = read('src/services/friends-first-contact.service.ts');
  // Unregistered branch returns before recordSocialContact
  const unregIdx = serviceSrc.indexOf("status: 'unregistered'");
  const recordIdx = serviceSrc.indexOf('await recordSocialContact');
  assert.ok(unregIdx > 0 && recordIdx > 0);
  assert.ok(
    unregIdx < recordIdx,
    'unregistered return must precede recordSocialContact',
  );
  pass('Unregistered returns before SocialContact upsert');
}

// —— Self rejection is explicit ——
{
  const serviceSrc = read('src/services/friends-first-contact.service.ts');
  assert.match(serviceSrc, /code:\s*'self'|FirstContactError\(\s*'self'/);
  pass('Self username rejected via FirstContactError');
}

// —— Analytics constants ——
{
  const constantsSrc = readFileSync(
    join(root, '../../packages/shared/src/constants.ts'),
    'utf8',
  );
  for (const name of [
    'WHO_FIRST_CONTACT_OPEN',
    'WHO_FIRST_CONTACT_SUBMIT',
    'WHO_FIRST_CONTACT_REGISTERED',
    'WHO_FIRST_CONTACT_UNREGISTERED',
    'WHO_FIRST_CONTACT_WHAT_OPENED',
    'WHO_FIRST_CONTACT_INVITE_SHARE',
    'WHO_FIRST_CONTACT_FAIL',
  ]) {
    assert.match(constantsSrc, new RegExp(name));
  }
  pass('Analytics event constants present');
}

console.log(`\n${passed} passed\n`);
