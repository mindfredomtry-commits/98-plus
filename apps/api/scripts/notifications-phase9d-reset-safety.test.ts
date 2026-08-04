/**
 * Stage 8 Phase 9D — reset SQL split + Runtime cold-start / Journal identity guards.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-phase9d-reset-safety.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const apiRoot = join(__dirname, '..');
const webSrc = join(__dirname, '../../web/src');
const webScripts = join(__dirname, '../../web/scripts');
let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

{
  const syncTypes = read(
    join(webSrc, 'notification-runtime/notification-runtime.sync-types.ts'),
  );
  assert.match(
    syncTypes,
    /export function createInitialNotificationsReconcileStateV1[\s\S]*revision:\s*null/,
  );
  pass('1. Runtime starts with revision=null');
}

{
  const runtimeDir = join(webSrc, 'notification-runtime');
  const files = readdirSync(runtimeDir).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    const src = read(join(runtimeDir, f));
    assert.doesNotMatch(src, /localStorage\.(get|set)Item/);
    assert.doesNotMatch(src, /sessionStorage\.(get|set)Item/);
    assert.doesNotMatch(src, /indexedDB|openDB|CloudStorage/i);
  }
  const provider = read(
    join(webSrc, 'notification-runtime/NotificationRuntimeProvider.tsx'),
  );
  assert.match(provider, /createNotificationRuntimeStore\(\)/);
  assert.match(provider, /useMemo/);
  pass('2. Runtime revision not persisted client-side; cold Provider creates store');
}

{
  const reconcile = read(
    join(webSrc, 'notification-runtime/notification-runtime.reconcile.ts'),
  );
  // Stale snapshot protection unchanged
  assert.match(reconcile, /STALE_IGNORED/);
  assert.match(
    reconcile,
    /state\.revision != null[\s\S]*snapshot\.revision[\s\S]*state\.revision/,
  );
  assert.doesNotMatch(reconcile, /FULL_REBASE/);
  pass('5-6. No FULL_REBASE; stale revision protection retained');
}

{
  const sync = read(
    join(apiRoot, 'src/notifications/notifications-sync.service.ts'),
  );
  assert.match(sync, /latestRevisionForUser/);
  assert.match(sync, /rows\[0\]\?\.revision \?\? 0n/);
  assert.match(sync, /type: 'SNAPSHOT'/);
  assert.match(sync, /items,/);
  pass('3. Empty Sync SNAPSHOT uses MAX revision or 0; items from journal only');
}

{
  const journal = read(
    join(apiRoot, 'src/notifications/notification-journal.service.ts'),
  );
  assert.match(journal, /nextval\(/);
  assert.match(
    journal,
    /pg_get_serial_sequence\('"NotificationJournalEntry"', 'revision'\)/,
  );
  pass('4. Journal revision allocated via PostgreSQL identity nextval');
}

{
  const preview = read(
    join(apiRoot, 'scripts/phase9d-global-ban-reset-preview.sql'),
  );
  const previewCode = preview
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(previewCode, /\bBEGIN\b/i);
  assert.doesNotMatch(previewCode, /\bCOMMIT\b/i);
  assert.doesNotMatch(previewCode, /\bDELETE\b/i);
  assert.doesNotMatch(previewCode, /\bUPDATE\b/i);
  assert.doesNotMatch(previewCode, /\bTRUNCATE\b/i);
  assert.doesNotMatch(previewCode, /\bALTER\b/i);
  assert.doesNotMatch(previewCode, /\bCREATE\b/i);
  assert.doesNotMatch(previewCode, /\bINSERT\b/i);
  assert.match(previewCode, /SELECT/);
  assert.match(preview, /max_journal_revision/);
  assert.match(preview, /sequence_last_value/);
  assert.doesNotMatch(preview, /is_called/);
  assert.doesNotMatch(preview, /sequence_is_called/);
  pass('4. Preview SQL is SELECT-only (no mutations)');
}

{
  const exec = read(
    join(apiRoot, 'scripts/phase9d-global-ban-reset-execute.sql'),
  );
  const execCode = exec
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  assert.match(exec, /^BEGIN;/m);
  assert.match(exec, /^COMMIT;/m);
  assert.match(execCode, /DELETE FROM "NotificationJournalEntry"/);
  assert.doesNotMatch(execCode, /RESTART IDENTITY/i);
  assert.doesNotMatch(execCode, /ALTER SEQUENCE/i);
  assert.doesNotMatch(execCode, /\bsetval\s*\(/i);
  assert.doesNotMatch(execCode, /\bTRUNCATE\b/i);
  assert.doesNotMatch(execCode, /DELETE FROM "User"/);
  assert.doesNotMatch(execCode, /DELETE FROM "SocialContact"/);
  assert.doesNotMatch(execCode, /DELETE FROM "Payment"/);
  assert.doesNotMatch(execCode, /DELETE FROM "Entitlement"/);
  assert.doesNotMatch(execCode, /DELETE FROM "SelfBan"/);
  assert.match(execCode, /RAISE EXCEPTION/);
  assert.match(execCode, /user_before/);
  assert.match(exec, /Ban count = % \(expected 0\)/);
  assert.match(exec, /NotificationJournalEntry count = % \(expected 0\)/);
  assert.match(exec, /User count changed/);
  pass('5-10. Execute SQL: DELETE journal, BEGIN/COMMIT, asserts, no protected deletes');
}

{
  const backfill = read(
    join(apiRoot, 'scripts/notifications-journal-backfill.ts'),
  );
  assert.match(backfill, /FORCE_LEGACY_BACKFILL/);
  assert.match(backfill, /REFUSED/);
  // No deploy doc requiring journal backfill in repo root ALPHA / scripts
  const phase9c = read(
    join(apiRoot, 'scripts/notifications-phase9c-no-timeout.test.ts'),
  );
  assert.match(phase9c, /FORCE_LEGACY_BACKFILL|REFUSED/);
  pass('11. Backfill refused by default; not part of cutover');
}

{
  const banSvc = read(join(apiRoot, 'src/services/ban.service.ts'));
  assert.doesNotMatch(banSvc, /opsTimeoutResult/);
  assert.doesNotMatch(
    banSvc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
    /outcome:\s*['"]TIMEOUT['"]/,
  );
  const scheduler = read(join(apiRoot, 'src/jobs/scheduler.ts'));
  assert.doesNotMatch(scheduler, /processStaleChecks/);
  pass('12. TIMEOUT production writers remain absent');
}

{
  // Schema completeness: soft-ref / delete classifications present in execute
  const schema = read(join(apiRoot, 'prisma/schema.prisma'));
  assert.match(schema, /model Ban /);
  assert.match(schema, /model BanCheckAnswer/);
  assert.match(schema, /model SavedBan/);
  assert.match(schema, /model BanThread/);
  assert.match(schema, /model NotificationJournalEntry/);
  assert.match(schema, /model BanInvite/);
  assert.match(schema, /model BotRetentionLog/);
  assert.match(schema, /model PairDailyStat/);
  assert.match(schema, /model SelfBan/);
  const exec = read(
    join(apiRoot, 'scripts/phase9d-global-ban-reset-execute.sql'),
  );
  const execCode = exec
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  assert.match(exec, /BanInvite/);
  assert.match(exec, /BotRetentionLog/);
  assert.match(exec, /parentBanId/);
  assert.match(exec, /PairDailyStat/);
  assert.match(exec, /ban_sent/);
  assert.match(execCode, /result_shared/);
  assert.doesNotMatch(execCode, /session_recovered/);
  const previewAnalytics = read(
    join(apiRoot, 'scripts/phase9d-global-ban-reset-preview.sql'),
  );
  const previewCodeAnalytics = previewAnalytics
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(previewCodeAnalytics, /session_recovered/);
  pass('schema inventory covered by execute script');
}

console.log(`\n${passed} passed\n`);
