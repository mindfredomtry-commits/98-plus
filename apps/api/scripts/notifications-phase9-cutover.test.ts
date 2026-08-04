/**
 * Stage 8 Phase 9 — API source guards (no web imports).
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-phase9-cutover.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const apiRoot = join(__dirname, '..');
let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

{
  const banSvc = readFileSync(
    join(apiRoot, 'src/services/ban.service.ts'),
    'utf8',
  );
  assert.match(banSvc, /appendJournalOpsFlatTx/);
  assert.match(banSvc, /publishCommittedNotificationDeltas/);
  assert.match(banSvc, /opsUpsertIncomingForReceiver/);
  assert.match(banSvc, /opsOverboardResult/);
  assert.match(banSvc, /opsCheckCompletion|opsFirstCheckAnswer/);
  assert.doesNotMatch(banSvc, /opsTimeoutResult/);
  assert.match(banSvc, /opsRemoveResultForUser/);
  assert.match(banSvc, /opsUpsertCheckForBoth/);
  pass('ban.service: lifecycle journal ops wired (no auto TIMEOUT)');
}

{
  const invite = readFileSync(
    join(apiRoot, 'src/services/invite.service.ts'),
    'utf8',
  );
  assert.match(invite, /appendJournalOpsFlatTx/);
  assert.match(invite, /opsUpsertIncomingForReceiver/);
  pass('invite.service: materialize writes journal');
}

{
  const builders = readdirSync(join(apiRoot, 'src/notifications'));
  assert.ok(builders.includes('notification-item-builders.ts'));
  assert.ok(builders.includes('notification-journal-commit.ts'));
  assert.ok(builders.includes('ban-notification-ops.ts'));
  const itemBuilders = readFileSync(
    join(apiRoot, 'src/notifications/notification-item-builders.ts'),
    'utf8',
  );
  assert.match(itemBuilders, /buildIncomingBanNotificationItemV1/);
  assert.match(itemBuilders, /buildCheckRequestNotificationItemV1/);
  assert.match(itemBuilders, /buildBanResultNotificationItemV1/);
  assert.match(itemBuilders, /notificationItemV1ObjectSchema\.parse/);
  pass('payload builders exist and validate with Zod');
}

{
  const commit = readFileSync(
    join(apiRoot, 'src/notifications/notification-journal-commit.ts'),
    'utf8',
  );
  assert.match(commit, /fromRevision: revStr\(prev\)/);
  assert.match(commit, /publishCommittedNotificationDeltas/);
  assert.doesNotMatch(commit, /broadcastToUser/);
  pass('journal commit: per-user fromRevision; publish post-commit only');
}

{
  const sync = readFileSync(
    join(apiRoot, 'src/notifications/notifications-sync.service.ts'),
    'utf8',
  );
  assert.match(sync, /"userId" = \$\{input\.userId\}/);
  assert.match(sync, /"revision" > \$\{after\}/);
  pass('sync queries user-scoped revisions (cross-user gaps skipped)');
}

{
  const routes = readFileSync(join(apiRoot, 'src/routes/bans.ts'), 'utf8');
  assert.match(routes, /notifications:/);
  pass('action routes return notifications delta envelope');
}

{
  const backfill = readFileSync(
    join(apiRoot, 'scripts/notifications-journal-backfill.ts'),
    'utf8',
  );
  assert.match(backfill, /--dry-run/);
  assert.match(backfill, /latestOpIsUpsert/);
  assert.match(backfill, /FORCE_LEGACY_BACKFILL|PHASE 9C CUTOVER/);
  assert.match(backfill, /timeoutPolicy: 'EXCLUDE'|TIMEOUT_excluded/);
  pass('backfill script: refused by default; legacy dry-run + TIMEOUT exclude');
}

console.log(`\n${passed} passed\n`);
