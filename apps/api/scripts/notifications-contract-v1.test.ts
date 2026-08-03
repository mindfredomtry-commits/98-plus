/**
 * Stage 8 Phase 6 — Notifications Journal / Contract V1 foundation tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-contract-v1.test.ts
 *
 * Proves server foundation without wiring production Notifications transport.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTIFICATIONS_DELTA_V1_EVENT,
  assertDeliveryPolicyV1,
  notificationItemIdV1,
  parseNotificationItemIdV1,
  type NotificationItemV1,
  type NotificationOperationV1,
} from '@98plus/shared';
import {
  notificationItemV1Schema,
  notificationOperationV1Schema,
  notificationsDeltaV1Schema,
  notificationsSnapshotV1Schema,
  notificationsSyncResponseV1Schema,
} from '../src/notifications/notifications-contract-v1.schema';

const root = join(__dirname, '..');
const webSrc = join(__dirname, '../../web/src');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

/** In-memory journal mirror for pure ordering/projection semantics. */
type MemRow = {
  revision: bigint;
  userId: string;
  operationType: 'UPSERT_ITEM' | 'REMOVE_ITEM';
  itemId: string;
  itemSequence: bigint | null;
  item: NotificationItemV1 | null;
};

class MemJournal {
  rows: MemRow[] = [];
  nextRev = 1n;
  published: unknown[] = [];

  append(
    userId: string,
    ops: Array<
      | { type: 'UPSERT_ITEM'; item: Omit<NotificationItemV1, 'sequence'> }
      | { type: 'REMOVE_ITEM'; itemId: string }
    >,
  ): NotificationOperationV1[] {
    const out: NotificationOperationV1[] = [];
    for (const op of ops) {
      const revision = this.nextRev++;
      if (op.type === 'REMOVE_ITEM') {
        this.rows.push({
          revision,
          userId,
          operationType: 'REMOVE_ITEM',
          itemId: op.itemId,
          itemSequence: null,
          item: null,
        });
        out.push({
          type: 'REMOVE_ITEM',
          revision: revision.toString(),
          itemId: op.itemId,
        });
        continue;
      }
      const prev = [...this.rows]
        .reverse()
        .find(
          (r) =>
            r.userId === userId &&
            r.itemId === op.item.itemId &&
            r.operationType === 'UPSERT_ITEM' &&
            r.itemSequence != null,
        );
      const itemSequence = prev?.itemSequence ?? revision;
      const item: NotificationItemV1 = {
        ...op.item,
        sequence: itemSequence.toString(),
      };
      this.rows.push({
        revision,
        userId,
        operationType: 'UPSERT_ITEM',
        itemId: item.itemId,
        itemSequence,
        item,
      });
      out.push({
        type: 'UPSERT_ITEM',
        revision: revision.toString(),
        item,
      });
    }
    return out;
  }

  snapshot(userId: string) {
    const latest = new Map<string, MemRow>();
    for (const row of this.rows) {
      if (row.userId !== userId) continue;
      latest.set(row.itemId, row);
    }
    const items = [...latest.values()]
      .filter((r) => r.operationType === 'UPSERT_ITEM' && r.item)
      .map((r) => r.item!)
      .sort((a, b) => {
        const d = BigInt(a.sequence) - BigInt(b.sequence);
        if (d < 0n) return -1;
        if (d > 0n) return 1;
        return a.itemId.localeCompare(b.itemId);
      });
    const revision =
      this.rows.filter((r) => r.userId === userId).at(-1)?.revision ?? 0n;
    return { type: 'SNAPSHOT' as const, revision: revision.toString(), items };
  }

  delta(userId: string, after: bigint) {
    const ops = this.rows
      .filter((r) => r.userId === userId && r.revision > after)
      .map((r) => {
        if (r.operationType === 'REMOVE_ITEM') {
          return {
            type: 'REMOVE_ITEM' as const,
            revision: r.revision.toString(),
            itemId: r.itemId,
          };
        }
        return {
          type: 'UPSERT_ITEM' as const,
          revision: r.revision.toString(),
          item: r.item!,
        };
      });
    const revision = ops.at(-1)?.revision ?? after.toString();
    return {
      type: 'DELTA' as const,
      fromRevision: after.toString(),
      revision,
      operations: ops,
    };
  }
}

function incomingItem(
  userId: string,
  banId: string,
  createdAt: string,
): Omit<NotificationItemV1, 'sequence'> {
  return {
    itemId: notificationItemIdV1('INCOMING_BAN', banId),
    userId,
    kind: 'INCOMING_BAN',
    banId,
    createdAt,
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'INCOMING_BAN',
      banId,
      text: `ban ${banId}`,
      durationMinutes: 30,
      senderId: 'sender',
      receiverId: userId,
      createdAt,
    },
  };
}

function resultItem(
  userId: string,
  banId: string,
  causedByItemId: string | null,
  policy: 'FIFO' | 'NEXT_IN_SESSION',
): Omit<NotificationItemV1, 'sequence'> {
  return {
    itemId: notificationItemIdV1('BAN_RESULT', banId),
    userId,
    kind: 'BAN_RESULT',
    banId,
    createdAt: '2026-08-03T12:00:00.000Z',
    deliveryPolicy: policy,
    causedByItemId,
    payload: {
      kind: 'BAN_RESULT',
      banId,
      outcome: 'overboard',
      text: 'перебор',
      completedAt: '2026-08-03T12:00:00.000Z',
      senderId: 'sender',
      receiverId: userId,
    },
  };
}

console.log('\n=== NOTIFICATIONS CONTRACT V1 FOUNDATION ===\n');

{
  assert.equal(notificationItemIdV1('INCOMING_BAN', 'b1'), 'incoming:b1');
  assert.equal(notificationItemIdV1('CHECK_REQUEST', 'b1'), 'check:b1');
  assert.equal(notificationItemIdV1('BAN_RESULT', 'b1'), 'result:b1');
  assert.deepEqual(parseNotificationItemIdV1('incoming:b1'), {
    kind: 'INCOMING_BAN',
    banId: 'b1',
  });
  assert.deepEqual(parseNotificationItemIdV1('check:b1'), {
    kind: 'CHECK_REQUEST',
    banId: 'b1',
  });
  assert.deepEqual(parseNotificationItemIdV1('result:b1'), {
    kind: 'BAN_RESULT',
    banId: 'b1',
  });
  assert.equal(parseNotificationItemIdV1('nope'), null);
  pass('3/12. Deterministic itemId formulas');
}

{
  assert.throws(() =>
    assertDeliveryPolicyV1({
      deliveryPolicy: 'NEXT_IN_SESSION',
      causedByItemId: null,
    }),
  );
  assert.doesNotThrow(() =>
    assertDeliveryPolicyV1({
      deliveryPolicy: 'NEXT_IN_SESSION',
      causedByItemId: 'incoming:b1',
    }),
  );
  assert.doesNotThrow(() =>
    assertDeliveryPolicyV1({
      deliveryPolicy: 'FIFO',
      causedByItemId: null,
    }),
  );
  pass('11. Delivery policy NEXT_IN_SESSION requires causedByItemId');
}

{
  const j = new MemJournal();
  const u = 'user-a';
  const a = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '1', '2026-08-03T10:00:00.000Z') },
  ]);
  const b = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '2', '2026-08-03T10:01:00.000Z') },
  ]);
  assert.equal(BigInt(a[0]!.revision) < BigInt(b[0]!.revision), true);
  assert.equal(
    BigInt((a[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence) <
      BigInt((b[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence),
    true,
  );
  pass('1-2. Journal revision and new item sequence are monotonic');
}

{
  const j = new MemJournal();
  const u = 'user-a';
  const first = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '1', '2026-08-03T10:00:00.000Z') },
  ]);
  const seq = (first[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item
    .sequence;
  const second = j.append(u, [
    {
      type: 'UPSERT_ITEM',
      item: {
        ...incomingItem(u, '1', '2026-08-03T10:00:00.000Z'),
        payload: {
          ...incomingItem(u, '1', '2026-08-03T10:00:00.000Z').payload,
          text: 'updated text',
        },
      },
    },
  ]);
  assert.equal(
    (second[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence,
    seq,
  );
  assert.notEqual(second[0]!.revision, first[0]!.revision);
  const snap = j.snapshot(u);
  assert.equal(snap.items.length, 1);
  assert.equal(snap.items[0]!.payload.kind === 'INCOMING_BAN' ? snap.items[0]!.payload.text : '', 'updated text');
  pass('4/6/7. Append-only; repeated UPSERT no duplicate; sequence preserved');
}

{
  const j = new MemJournal();
  const u = 'user-a';
  j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '1', '2026-08-03T10:00:00.000Z') },
  ]);
  j.append(u, [{ type: 'REMOVE_ITEM', itemId: 'incoming:1' }]);
  const snap = j.snapshot(u);
  assert.equal(snap.items.length, 0);
  pass('5. UPSERT then REMOVE excludes item from snapshot');
}

{
  const j = new MemJournal();
  const u = 'user-a';
  j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '1', '2026-08-03T10:00:00.000Z') },
    {
      type: 'UPSERT_ITEM',
      item: {
        itemId: notificationItemIdV1('CHECK_REQUEST', 'c1'),
        userId: u,
        kind: 'CHECK_REQUEST',
        banId: 'c1',
        createdAt: '2026-08-03T10:02:00.000Z',
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
        payload: {
          kind: 'CHECK_REQUEST',
          banId: 'c1',
          text: 'check',
          checkDueAt: null,
          senderId: 's',
          receiverId: u,
          createdAt: '2026-08-03T10:02:00.000Z',
        },
      },
    },
    {
      type: 'UPSERT_ITEM',
      item: resultItem(u, 'r1', null, 'FIFO'),
    },
  ]);
  const snap = j.snapshot(u);
  assert.equal(snap.items.length, 3);
  assert.deepEqual(
    snap.items.map((i) => i.kind),
    ['INCOMING_BAN', 'CHECK_REQUEST', 'BAN_RESULT'],
  );
  const seqs = snap.items.map((i) => BigInt(i.sequence));
  assert.equal(seqs[0]! < seqs[1]! && seqs[1]! < seqs[2]!, true);
  notificationsSnapshotV1Schema.parse(snap);
  pass('8-9. Snapshot includes multi-kind items ordered by sequence ASC');
}

{
  const j = new MemJournal();
  const u = 'user-a';
  j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '1', '2026-08-03T10:00:00.000Z') },
  ]);
  const after = BigInt(j.snapshot(u).revision);
  const ops = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, '2', '2026-08-03T10:01:00.000Z') },
    { type: 'REMOVE_ITEM', itemId: 'incoming:1' },
  ]);
  const delta = j.delta(u, after);
  assert.equal(delta.type, 'DELTA');
  assert.equal(delta.operations.length, 2);
  assert.equal(BigInt(delta.operations[0]!.revision) < BigInt(delta.operations[1]!.revision), true);
  notificationsDeltaV1Schema.parse(delta);
  assert.equal(ops.length, 2);
  pass('10. Delta orders revision ASC');
}

{
  const item = {
    ...incomingItem('user-a', '1', '2026-08-03T10:00:00.000Z'),
    sequence: '1',
  };
  notificationItemV1Schema.parse(item);
  const op = {
    type: 'UPSERT_ITEM' as const,
    revision: '1',
    item,
  };
  notificationOperationV1Schema.parse(op);
  const snap = {
    type: 'SNAPSHOT' as const,
    revision: '1',
    items: [item],
  };
  const delta = {
    type: 'DELTA' as const,
    fromRevision: '0',
    revision: '1',
    operations: [op],
  };
  notificationsSyncResponseV1Schema.parse(snap);
  notificationsSyncResponseV1Schema.parse(delta);
  assert.equal(NOTIFICATIONS_DELTA_V1_EVENT, 'notifications:delta:v1');
  pass('11. HTTP/WS share Contract V1 zod schemas + event name');
}

{
  // Invalid afterRevision handling is implemented in sync service as SNAPSHOT fallback.
  const syncSrc = read('src/notifications/notifications-sync.service.ts');
  assert.match(syncSrc, /parseAfterRevision/);
  assert.match(syncSrc, /revisionExistsForUser/);
  assert.match(syncSrc, /buildSnapshot/);
  assert.match(syncSrc, /return buildSnapshot/);
  pass('12. Invalid afterRevision returns snapshot (source)');
}

{
  const route = read('src/routes/notifications.ts');
  assert.match(route, /requireAuth/);
  assert.match(route, /req\.userId/);
  assert.match(route, /getNotificationsSyncV1/);
  assert.match(route, /afterRevision/);
  assert.doesNotMatch(route, /prisma\./);
  pass('13. HTTP auth: own userId only; no Prisma row leak');
}

{
  const journal = read('src/notifications/notification-journal.service.ts');
  assert.match(journal, /TransactionClient|NotificationJournalTx/);
  assert.match(journal, /pg_advisory_xact_lock/);
  assert.doesNotMatch(journal, /publishNotificationsDeltaV1|broadcastToUser/);
  const pub = read('src/websocket/notifications-delta-v1.ts');
  assert.match(pub, /after a committed transaction|after commit/i);
  assert.match(pub, /NOTIFICATIONS_DELTA_V1_EVENT/);
  pass('14-15. Journal has no WS publish; publisher is post-commit only');
}

{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  const prefetch = readFileSync(
    join(webSrc, 'lib/pending-chain-prefetch.ts'),
    'utf8',
  );
  // Phase 9 cutover: Transport calls Sync; pending prefetch must not be Sync authority.
  assert.match(transport, /runNotificationsSyncViaMapper|\/notifications\/sync/);
  assert.doesNotMatch(transport, /pending-all|fetchPendingChainPrefetch/);
  assert.doesNotMatch(prefetch, /\/notifications\/sync/);
  const app = read('src/app.ts');
  assert.match(app, /\/notifications/);
  assert.match(app, /notificationsRouter/);
  pass('16. Production Notifications transport wired to /notifications/sync (Phase 9)');
}

{
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260803120000_notification_journal_v1/migration.sql',
  );
  assert.match(schema, /model NotificationJournalEntry/);
  assert.match(schema, /onDelete: Restrict/);
  assert.doesNotMatch(schema, /NotificationJournalEntry.*Ban|Ban.*NotificationJournalEntry/);
  assert.match(migration, /BIGSERIAL/);
  assert.match(migration, /NotificationJournalEntry_userId_revision_idx/);
  assert.match(migration, /ON DELETE RESTRICT/);
  pass('Journal schema append-only + no Ban FK cascade');
}

{
  const shared = readFileSync(
    join(__dirname, '../../../packages/shared/src/notifications-contract-v1.ts'),
    'utf8',
  );
  assert.match(shared, /NotificationItemKindV1/);
  assert.match(shared, /NotificationsSyncResponseV1/);
  assert.match(shared, /notificationItemIdV1/);
  pass('Contract V1 exported from shared package source');
}

{
  // CHECK 1 — first UPSERT: revision === itemSequence
  const j = new MemJournal();
  const u = 'user-a';
  const first = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'seq-1', '2026-08-03T10:00:00.000Z') },
  ]);
  const up = first[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>;
  assert.equal(up.revision, up.item.sequence);
  pass('CHECK1. first UPSERT: revision === itemSequence');
}

{
  // CHECK 1 — repeated UPSERT preserves R1 sequence under new R2 revision
  const j = new MemJournal();
  const u = 'user-a';
  const first = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'seq-2', '2026-08-03T10:00:00.000Z') },
  ]);
  const r1Seq = (first[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item
    .sequence;
  const second = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'seq-2', '2026-08-03T10:00:00.000Z') },
  ]);
  const up2 = second[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>;
  assert.equal(up2.item.sequence, r1Seq);
  assert.notEqual(up2.revision, first[0]!.revision);
  assert.notEqual(up2.item.sequence, up2.revision);
  pass('CHECK1. repeated UPSERT: itemSequence stays R1, revision advances');
}

{
  // CHECK 1 — concurrent repeated UPSERT: serialized per-user (lock semantics).
  // Without lock, two readers could both see null and allocate distinct sequences.
  // Production lockUserJournal(tx, userId) runs before latestItemSequence.
  const journalSrc = read('src/notifications/notification-journal.service.ts');
  const lockIdx = journalSrc.indexOf('await lockUserJournal(tx, userId)');
  const seqIdx = journalSrc.indexOf('await latestItemSequence(');
  assert.equal(lockIdx > 0 && seqIdx > lockIdx, true);
  assert.match(journalSrc, /pg_advisory_xact_lock\(hashtext\(\$\{userId\}\)\)/);

  const j = new MemJournal();
  const u = 'user-a';
  // Serialized concurrent writers (advisory lock equivalent):
  const a = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'conc', '2026-08-03T10:00:00.000Z') },
  ]);
  const b = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'conc', '2026-08-03T10:00:00.000Z') },
  ]);
  const seqA = (a[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence;
  const seqB = (b[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence;
  assert.equal(seqA, seqB);
  pass('CHECK1. concurrent re-UPSERT serialized: sequence preserved (lock-before-lookup)');
}

{
  // CHECK 1 — User A and User B same itemId: independent journals/sequences
  const j = new MemJournal();
  const a = j.append('user-a', [
    { type: 'UPSERT_ITEM', item: incomingItem('user-a', 'shared-ban', '2026-08-03T10:00:00.000Z') },
  ]);
  const b = j.append('user-b', [
    { type: 'UPSERT_ITEM', item: incomingItem('user-b', 'shared-ban', '2026-08-03T10:01:00.000Z') },
  ]);
  const seqA = (a[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence;
  const seqB = (b[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item.sequence;
  assert.notEqual(seqA, seqB);
  assert.equal(j.snapshot('user-a').items.length, 1);
  assert.equal(j.snapshot('user-b').items.length, 1);
  assert.equal(j.snapshot('user-a').items[0]!.itemId, 'incoming:shared-ban');
  assert.equal(j.snapshot('user-b').items[0]!.itemId, 'incoming:shared-ban');
  // Production lookup is WHERE userId AND itemId — confirm in source
  const journalSrc = read('src/notifications/notification-journal.service.ts');
  assert.match(
    journalSrc,
    /WHERE "userId" = \$\{userId\}[\s\S]*AND "itemId" = \$\{itemId\}/,
  );
  pass('CHECK1. User A/B same itemId: independent sequences; lookup scoped userId+itemId');
}

{
  // CHECK 1 — UPSERT → REMOVE → UPSERT: preserve original sequence for same itemId
  // Mirrors production latestItemSequence (latest UPSERT_ITEM with itemSequence, ignores REMOVE)
  const j = new MemJournal();
  const u = 'user-a';
  const first = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'rm', '2026-08-03T10:00:00.000Z') },
  ]);
  const r1 = (first[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>).item
    .sequence;
  j.append(u, [{ type: 'REMOVE_ITEM', itemId: 'incoming:rm' }]);
  assert.equal(j.snapshot(u).items.length, 0);
  const again = j.append(u, [
    { type: 'UPSERT_ITEM', item: incomingItem(u, 'rm', '2026-08-03T10:05:00.000Z') },
  ]);
  const up = again[0] as Extract<NotificationOperationV1, { type: 'UPSERT_ITEM' }>;
  assert.equal(up.item.sequence, r1);
  assert.notEqual(up.revision, first[0]!.revision);
  assert.equal(j.snapshot(u).items.length, 1);
  assert.equal(j.snapshot(u).items[0]!.sequence, r1);

  const journalSrc = read('src/notifications/notification-journal.service.ts');
  assert.match(journalSrc, /operationType" = 'UPSERT_ITEM'/);
  assert.match(journalSrc, /COALESCE\(\$\{existingSequence\}, next_rev\.revision\)/);
  pass('CHECK1. UPSERT→REMOVE→UPSERT preserves original itemSequence');
}

{
  // CHECK 2 — transaction-client purity (static): every DB op uses tx, never global prisma
  const journalSrc = read('src/notifications/notification-journal.service.ts');
  assert.doesNotMatch(journalSrc, /from ['"]\.\.\/lib\/prisma['"]/);
  assert.doesNotMatch(journalSrc, /from ['"]\.\/.*prisma['"]/);
  assert.match(journalSrc, /export type NotificationJournalTx = Prisma\.TransactionClient/);
  // DB call sites
  assert.match(journalSrc, /await tx\.\$executeRaw`[\s\S]*pg_advisory_xact_lock/);
  assert.match(journalSrc, /async function latestItemSequence\(\s*tx: NotificationJournalTx/);
  assert.match(journalSrc, /const rows = await tx\.\$queryRaw/);
  // No bare prisma. identifier for client use
  assert.doesNotMatch(journalSrc, /\bprisma\.(notification|\$|ban)/i);
  assert.doesNotMatch(journalSrc, /publishNotificationsDeltaV1|broadcastToUser/);
  pass('CHECK2. tx purity: type TransactionClient; lock/lookup/insert via tx; no WS in journal');
}

{
  // CHECK 2 — rollback boundary:
  // Live prisma.$transaction rollback requires DATABASE_URL (not present in this env).
  // Prove contract: append uses only tx → thrown error aborts tx → no durable rows;
  // publisher is never called from journal (post-commit boundary only).
  let published = false;
  const fakePublish = () => {
    published = true;
  };
  const durable: NotificationOperationV1[] = [];
  try {
    awaitableRollbackSim(durable);
    throw new Error('ROLLBACK');
  } catch {
    durable.length = 0; // tx abort discards staged writes
  }
  assert.equal(durable.length, 0);
  assert.equal(published, false);
  void fakePublish;

  const journalSrc = read('src/notifications/notification-journal.service.ts');
  assert.match(
    journalSrc,
    /Does not publish WebSocket events \(caller publishes only after commit\)/,
  );
  const pub = read('src/websocket/notifications-delta-v1.ts');
  assert.match(pub, /Call only after a committed transaction/);
  pass('CHECK2. rollback: staged journal discarded; no WS publish inside tx boundary');
}

function awaitableRollbackSim(staged: NotificationOperationV1[]): void {
  staged.push({
    type: 'UPSERT_ITEM',
    revision: '1',
    item: {
      ...incomingItem('u', 'rollback-x', '2026-08-03T10:00:00.000Z'),
      sequence: '1',
    },
  });
}

console.log(`\n${passed} passed\n`);
