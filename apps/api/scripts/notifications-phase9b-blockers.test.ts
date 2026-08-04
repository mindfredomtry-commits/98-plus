/**
 * Stage 8 Phase 9B — atomicity, backfill policy, contract/UI completeness.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-phase9b-blockers.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  notificationItemIdV1,
  type NotificationItemV1,
} from '@98plus/shared';
import {
  buildBanResultNotificationItemV1,
  buildCheckRequestNotificationItemV1,
  buildIncomingBanNotificationItemV1,
  partyPublicFromUser,
} from '../src/notifications/notification-item-builders';
import {
  banPartyFromUsers,
  opsCheckCompletion,
  opsOverboardResult,
} from '../src/notifications/ban-notification-ops';
import { notificationItemV1ObjectSchema } from '../src/notifications/notifications-contract-v1.schema';

const apiRoot = join(__dirname, '..');
let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

const sender = partyPublicFromUser({
  id: 's1',
  username: 'alice',
  firstName: 'Alice',
  photoUrl: 'https://cdn.example/a.jpg',
});
const receiver = partyPublicFromUser({
  id: 'r1',
  username: 'bob',
  firstName: 'Bob',
  photoUrl: 'https://cdn.example/b.jpg',
});

function banParties() {
  return banPartyFromUsers({
    id: 'ban1',
    text: 'drink water',
    senderId: 's1',
    receiverId: 'r1',
    durationMinutes: 30,
    createdAt: '2026-08-04T10:00:00.000Z',
    completedAt: '2026-08-04T12:00:00.000Z',
    outcome: 'overboard',
    sender,
    receiver,
  });
}

{
  const banSvc = readFileSync(
    join(apiRoot, 'src/services/ban.service.ts'),
    'utf8',
  );
  const energy = readFileSync(
    join(apiRoot, 'src/services/energy.service.ts'),
    'utf8',
  );

  // Overboard: applyOverboard(..., tx) inside $transaction with journal
  assert.match(banSvc, /applyOverboard\(/);
  assert.ok(
    /applyOverboard\([\s\S]*?\btx\b[\s\S]*?\)/.test(banSvc),
    'applyOverboard must receive tx',
  );
  assert.match(banSvc, /opsOverboardResult/);
  assert.match(banSvc, /publishCommittedNotificationDeltas\(journalDeltas\)/);

  // Check completion: applyCheckResult(..., tx) inside same tx as journal
  assert.ok(
    /applyCheckResult\([\s\S]*?\btx\b[\s\S]*?\)/.test(banSvc),
    'applyCheckResult must receive tx',
  );
  assert.match(banSvc, /opsCheckCompletion/);
  assert.match(banSvc, /opsFirstCheckAnswer/);

  // Phase 9C: automatic TIMEOUT removed — processStaleChecks is no-op
  assert.doesNotMatch(banSvc, /opsTimeoutResult/);
  const staleStart = banSvc.indexOf('export async function processStaleChecks');
  assert.ok(staleStart >= 0);
  const staleEnd = banSvc.indexOf(
    '/** Admin: force expire timer → check */',
    staleStart,
  );
  const staleBody = banSvc.slice(
    staleStart,
    staleEnd > 0 ? staleEnd : staleStart + 400,
  );
  assert.match(staleBody, /no-op|automatic TIMEOUT deleted/i);

  assert.match(energy, /export type EnergyDb/);
  assert.match(energy, /export async function applyOverboard\(/);
  assert.match(energy, /db: EnergyDb = defaultPrisma/);
  assert.match(energy, /export async function applyCheckResult\(/);

  pass('1-5. Atomic Ban+energy+journal source guards (overboard/check; no TIMEOUT)');
}

{
  // Ban + Journal ops committed together (op construction for one mutation)
  const ops = opsOverboardResult({
    ...banParties(),
    completedAt: '2026-08-04T12:00:00.000Z',
    outcome: 'overboard',
  });
  assert.equal(ops.some((o) => o.type === 'REMOVE_ITEM'), true);
  assert.equal(
    ops.filter((o) => o.type === 'UPSERT_ITEM').length,
    2,
    'result for both parties',
  );
  const checkOps = opsCheckCompletion({
    ban: {
      ...banParties(),
      completedAt: '2026-08-04T12:00:00.000Z',
      outcome: 'both_yes',
    },
    answererId: 'r1',
  });
  assert.ok(checkOps.length >= 3);
  pass('4. Ban lifecycle ops include Ban+Journal pair for overboard/check');
}

{
  const commit = readFileSync(
    join(apiRoot, 'src/notifications/notification-journal-commit.ts'),
    'utf8',
  );
  assert.match(commit, /publishCommittedNotificationDeltas/);
  // appendJournalOpsFlatTx must not call publish internally
  const appendStart = commit.indexOf('export async function appendJournalOpsFlatTx');
  const appendEnd = commit.indexOf('export function publishCommittedNotificationDeltas');
  assert.ok(appendStart >= 0 && appendEnd > appendStart);
  const appendBody = commit.slice(appendStart, appendEnd);
  assert.doesNotMatch(appendBody, /publishCommittedNotificationDeltas\(/);
  assert.doesNotMatch(appendBody, /broadcastToUser/);
  pass('5. No WS publish inside journal append (post-commit only)');
}

{
  const backfill = readFileSync(
    join(apiRoot, 'scripts/notifications-journal-backfill.ts'),
    'utf8',
  );
  assert.match(backfill, /--dry-run/);
  assert.match(backfill, /TIMEOUT_excluded|timeoutPolicy: 'EXCLUDE'/);
  assert.match(backfill, /FORCE_LEGACY_BACKFILL|PHASE 9C CUTOVER/);
  assert.match(backfill, /latestOpIsUpsert/);
  assert.match(backfill, /INCOMING_BAN:/);
  assert.match(backfill, /CHECK_REQUEST:/);
  assert.match(backfill, /BAN_RESULT:/);
  assert.match(backfill, /OVERBOARD:/);
  assert.match(backfill, /duplicateLogical/);
  assert.match(backfill, /invalidPayload/);
  assert.match(backfill, /usersAffected/);
  pass('6-7. Backfill refused by default; legacy TIMEOUT exclude retained');
}

{
  const incoming = buildIncomingBanNotificationItemV1({
    userId: 'r1',
    banId: 'ban1',
    text: 'drink water',
    durationMinutes: 30,
    senderId: 's1',
    receiverId: 'r1',
    createdAt: '2026-08-04T10:00:00.000Z',
    sender,
    receiver,
  });
  const check = buildCheckRequestNotificationItemV1({
    userId: 'r1',
    banId: 'ban1',
    text: 'drink water',
    durationMinutes: 30,
    checkDueAt: '2026-08-04T10:30:00.000Z',
    senderId: 's1',
    receiverId: 'r1',
    createdAt: '2026-08-04T10:00:00.000Z',
    sender,
    receiver,
  });
  const result = buildBanResultNotificationItemV1({
    userId: 'r1',
    banId: 'ban1',
    outcome: 'overboard',
    text: 'drink water',
    completedAt: '2026-08-04T12:00:00.000Z',
    senderId: 's1',
    receiverId: 'r1',
    sender,
    receiver,
    deliveryPolicy: 'NEXT_IN_SESSION',
    causedByItemId: notificationItemIdV1('INCOMING_BAN', 'ban1'),
  });

  for (const item of [incoming, check, result]) {
    const full: NotificationItemV1 = { ...item, sequence: '1' };
    notificationItemV1ObjectSchema.parse(full);
  }

  assert.equal(incoming.payload.kind, 'INCOMING_BAN');
  if (incoming.payload.kind === 'INCOMING_BAN') {
    assert.equal(incoming.payload.sender.username, 'alice');
    assert.equal(incoming.payload.sender.photoUrl, 'https://cdn.example/a.jpg');
    assert.equal(incoming.payload.text, 'drink water');
    assert.equal(incoming.payload.durationMinutes, 30);
  }
  assert.equal(check.payload.kind, 'CHECK_REQUEST');
  if (check.payload.kind === 'CHECK_REQUEST') {
    assert.equal(check.payload.durationMinutes, 30);
    assert.equal(check.payload.checkDueAt, '2026-08-04T10:30:00.000Z');
    assert.equal(check.payload.receiver.firstName, 'Bob');
  }
  assert.equal(result.payload.kind, 'BAN_RESULT');
  if (result.payload.kind === 'BAN_RESULT') {
    assert.ok(result.payload.headline.length > 0);
    assert.ok(result.payload.subline.length > 0);
    assert.equal(result.payload.outcome, 'overboard');
  }

  const multiKind = [incoming, check, result].map((item, i) => ({
    ...item,
    sequence: String(i + 1),
  }));
  assert.deepEqual(
    multiKind.map((i) => i.kind),
    ['INCOMING_BAN', 'CHECK_REQUEST', 'BAN_RESULT'],
  );
  pass('8-9. Enriched Contract payloads + multi-kind snapshot shape');
}

{
  const banSvcFull = readFileSync(
    join(apiRoot, 'src/services/ban.service.ts'),
    'utf8',
  );
  const ackStart = banSvcFull.indexOf('export async function acknowledgeBanResult');
  assert.ok(ackStart >= 0);
  const ackEnd = banSvcFull.indexOf(
    '/** Timer reminder DMs removed',
    ackStart,
  );
  const ack = banSvcFull.slice(ackStart, ackEnd > 0 ? ackEnd : ackStart + 1200);
  assert.match(ack, /opsRemoveResultForUser/);
  assert.match(ack, /appendJournalOpsFlatTx/);
  assert.match(ack, /publishCommittedNotificationDeltas/);
  pass('result_ack always journals REMOVE + post-commit publish');
}

console.log(`\n${passed} passed\n`);
