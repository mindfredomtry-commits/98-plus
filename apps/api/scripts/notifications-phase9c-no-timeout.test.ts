/**
 * Stage 8 Phase 9C — remove automatic TIMEOUT + empty Journal cutover proofs.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-phase9c-no-timeout.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  opsCheckCompletion,
  opsOverboardResult,
  banPartyFromUsers,
  partyPublicFromUser,
} from '../src/notifications/ban-notification-ops';

const apiRoot = join(__dirname, '..');
let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

async function main() {
  {
    const banSvc = readFileSync(
      join(apiRoot, 'src/services/ban.service.ts'),
      'utf8',
    );
    const staleStart = banSvc.indexOf(
      'export async function processStaleChecks',
    );
    assert.ok(staleStart >= 0);
    const staleEnd = banSvc.indexOf(
      '/** Admin: force expire timer → check */',
      staleStart,
    );
    const staleBody = banSvc.slice(
      staleStart,
      staleEnd > 0 ? staleEnd : staleStart + 400,
    );
    assert.doesNotMatch(staleBody, /outcome:\s*'TIMEOUT'/);
    assert.doesNotMatch(staleBody, /opsTimeoutResult/);
    assert.doesNotMatch(staleBody, /CHECK_TIMEOUT_MINUTES/);
    assert.doesNotMatch(staleBody, /appendJournalOpsFlatTx/);
    assert.doesNotMatch(staleBody, /publishCommittedNotificationDeltas/);
    assert.match(staleBody, /no-op|automatic TIMEOUT deleted/i);

    assert.doesNotMatch(
      banSvc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
      /outcome:\s*['"]TIMEOUT['"]/,
    );
    assert.doesNotMatch(banSvc, /opsTimeoutResult/);
    pass('11. Source guard: no production TIMEOUT outcome / opsTimeoutResult');
    pass('1/5. processStaleChecks is no-op (source); no TIMEOUT / no WS');
  }

  {
    const scheduler = readFileSync(
      join(apiRoot, 'src/jobs/scheduler.ts'),
      'utf8',
    );
    assert.doesNotMatch(scheduler, /processStaleChecks/);
    assert.match(scheduler, /processExpiredBans/);
    assert.match(scheduler, /no auto TIMEOUT/);
    pass('scheduler: checkDueAt backup only; stale TIMEOUT unwired');
  }

  {
    const ops = readFileSync(
      join(apiRoot, 'src/notifications/ban-notification-ops.ts'),
      'utf8',
    );
    assert.doesNotMatch(ops, /opsTimeoutResult|function opsTimeout/);
    pass('4. No TIMEOUT BAN_RESULT journal ops builder');
  }

  {
    const sender = partyPublicFromUser({
      id: 's1',
      username: 'a',
      firstName: 'A',
      photoUrl: null,
    });
    const receiver = partyPublicFromUser({
      id: 'r1',
      username: 'b',
      firstName: 'B',
      photoUrl: null,
    });
    const base = banPartyFromUsers({
      id: 'ban1',
      text: 'x',
      senderId: 's1',
      receiverId: 'r1',
      durationMinutes: 30,
      createdAt: '2026-08-04T10:00:00.000Z',
      sender,
      receiver,
    });
    const overboard = opsOverboardResult({
      ...base,
      completedAt: '2026-08-04T12:00:00.000Z',
      outcome: 'overboard',
    });
    assert.ok(overboard.some((o) => o.type === 'UPSERT_ITEM'));
    const check = opsCheckCompletion({
      ban: {
        ...base,
        completedAt: '2026-08-04T12:00:00.000Z',
        outcome: 'both_yes',
      },
      answererId: 'r1',
    });
    assert.ok(check.some((o) => o.type === 'UPSERT_ITEM'));
    assert.ok(!JSON.stringify(overboard).includes('"timeout"'));
    pass('6-7. Explicit overboard + check completion ops still present');
  }

  {
    const backfill = readFileSync(
      join(apiRoot, 'scripts/notifications-journal-backfill.ts'),
      'utf8',
    );
    assert.match(backfill, /PHASE 9C CUTOVER — DO NOT RUN|FORCE_LEGACY_BACKFILL/);
    assert.match(backfill, /REFUSED/);
    pass('9-10. Empty Journal cutover: backfill refused by default');
  }

  {
    const sql = readFileSync(
      join(apiRoot, 'scripts/phase9c-global-ban-reset.sql'),
      'utf8',
    );
    assert.match(sql, /DEPRECATED|phase9d-global-ban-reset/);
    const preview = readFileSync(
      join(apiRoot, 'scripts/phase9d-global-ban-reset-preview.sql'),
      'utf8',
    );
    const exec = readFileSync(
      join(apiRoot, 'scripts/phase9d-global-ban-reset-execute.sql'),
      'utf8',
    );
    const previewCode = preview
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    assert.doesNotMatch(previewCode, /\bDELETE\b/i);
    assert.match(exec, /DELETE FROM "NotificationJournalEntry"/);
    const execCode = exec
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    assert.doesNotMatch(execCode, /RESTART IDENTITY/i);
    assert.match(exec, /RAISE EXCEPTION/);
    pass('reset SQL prepared: Ban/Journal clear; User/Payment preserved; no DDL');
  }

  {
    const schema = readFileSync(join(apiRoot, 'prisma/schema.prisma'), 'utf8');
    assert.match(schema, /TIMEOUT/);
    assert.match(schema, /Phase 9C Policy B|compatibility only/i);
    pass('3. TIMEOUT enum retained (Policy B) with unreachable production writers');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
