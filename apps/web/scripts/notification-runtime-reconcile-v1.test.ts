/**
 * Stage 8 Phase 7 — Notifications Runtime reconcile foundation tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-reconcile-v1.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  notificationItemIdV1,
  type NotificationItemV1,
  type NotificationOperationV1,
  type NotificationsDeltaV1,
  type NotificationsSnapshotV1,
} from '@98plus/shared';
import {
  applyCausalNextClaimV1,
  beginActionCaptureV1,
  claimActiveItemV1,
  reconcileNotificationsDeltaV1,
  reconcileNotificationsSnapshotV1,
  selectActionTargetV1,
  selectCausalNextItemIdV1,
  selectNotificationsAvailabilityV1,
  setNotificationsSyncStatusV1,
} from '../src/notification-runtime/notification-runtime.reconcile';
import {
  compareNotificationItemSequenceV1,
  compareNotificationSequenceV1,
} from '../src/notification-runtime/notification-runtime.sequence';
import {
  createInitialNotificationsReconcileStateV1,
  type NotificationsReconcileResultV1,
  type NotificationsReconcileStateV1,
} from '../src/notification-runtime/notification-runtime.sync-types';

const webSrc = join(__dirname, '../src');
const runtimeDir = join(webSrc, 'notification-runtime');

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function incoming(
  banId: string,
  sequence: string,
  userId = 'user-a',
  text = `ban ${banId}`,
): NotificationItemV1 {
  return {
    itemId: notificationItemIdV1('INCOMING_BAN', banId),
    userId,
    kind: 'INCOMING_BAN',
    banId,
    sequence,
    createdAt: '2026-08-03T10:00:00.000Z',
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'INCOMING_BAN',
      banId,
      text,
      durationMinutes: 30,
      senderId: 'sender',
      receiverId: userId,
      createdAt: '2026-08-03T10:00:00.000Z',
    },
  };
}

function checkItem(banId: string, sequence: string): NotificationItemV1 {
  return {
    itemId: notificationItemIdV1('CHECK_REQUEST', banId),
    userId: 'user-a',
    kind: 'CHECK_REQUEST',
    banId,
    sequence,
    createdAt: '2026-08-03T10:02:00.000Z',
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'CHECK_REQUEST',
      banId,
      text: 'check',
      checkDueAt: null,
      senderId: 's',
      receiverId: 'user-a',
      createdAt: '2026-08-03T10:02:00.000Z',
    },
  };
}

function resultFifo(banId: string, sequence: string): NotificationItemV1 {
  return {
    itemId: notificationItemIdV1('BAN_RESULT', banId),
    userId: 'user-a',
    kind: 'BAN_RESULT',
    banId,
    sequence,
    createdAt: '2026-08-03T12:00:00.000Z',
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'BAN_RESULT',
      banId,
      outcome: 'both_yes',
      text: 'ok',
      completedAt: '2026-08-03T12:00:00.000Z',
      senderId: 's',
      receiverId: 'user-a',
    },
  };
}

function resultCausal(
  banId: string,
  sequence: string,
  causedByItemId: string,
): NotificationItemV1 {
  return {
    ...resultFifo(banId, sequence),
    deliveryPolicy: 'NEXT_IN_SESSION',
    causedByItemId,
    payload: {
      kind: 'BAN_RESULT',
      banId,
      outcome: 'overboard',
      text: 'перебор',
      completedAt: '2026-08-03T12:00:00.000Z',
      senderId: 's',
      receiverId: 'user-a',
    },
  };
}

function snap(
  revision: string,
  items: NotificationItemV1[],
): NotificationsSnapshotV1 {
  return { type: 'SNAPSHOT', revision, items };
}

function delta(
  fromRevision: string,
  revision: string,
  operations: NotificationOperationV1[],
): NotificationsDeltaV1 {
  return { type: 'DELTA', fromRevision, revision, operations };
}

function mustApplied(
  r: NotificationsReconcileResultV1,
): NotificationsReconcileStateV1 {
  assert.equal(r.type, 'APPLIED', `expected APPLIED got ${r.type}`);
  return (r as Extract<NotificationsReconcileResultV1, { type: 'APPLIED' }>)
    .state;
}

function assertNoOwnerCommands(r: NotificationsReconcileResultV1): void {
  const raw = JSON.stringify(r);
  assert.doesNotMatch(raw, /sessionCompleted|OWNER|releaseOwner|CREATE_BAN/i);
  assert.doesNotMatch(raw, /"type":"ACTIVATE/);
}

console.log('\n=== NOTIFICATIONS RUNTIME RECONCILE V1 ===\n');

// —— Sequence comparator ————————————————————————————————
{
  assert.equal(compareNotificationSequenceV1('9', '10'), -1);
  assert.equal(compareNotificationSequenceV1('10', '9'), 1);
  const big = String(BigInt(Number.MAX_SAFE_INTEGER) + 10n);
  const bigger = String(BigInt(Number.MAX_SAFE_INTEGER) + 20n);
  assert.equal(compareNotificationSequenceV1(big, bigger), -1);
  assert.equal(
    compareNotificationItemSequenceV1(
      { sequence: '5', itemId: 'incoming:b' },
      { sequence: '5', itemId: 'incoming:a' },
    ),
    1,
  );
  const items = [
    incoming('z', '2'),
    incoming('a', '2'),
    incoming('m', '1'),
  ];
  const sorted1 = [...items].sort(compareNotificationItemSequenceV1);
  const sorted2 = [...items].sort(compareNotificationItemSequenceV1);
  assert.deepEqual(
    sorted1.map((i) => i.itemId),
    ['incoming:m', 'incoming:a', 'incoming:z'],
  );
  assert.deepEqual(
    sorted1.map((i) => i.itemId),
    sorted2.map((i) => i.itemId),
  );
  pass('sequence: 9<10; >MAX_SAFE_INTEGER; itemId tie-break; deterministic');
}

// —— Race 1: bootstrap/snapshot while active ——————————————
{
  let state = createInitialNotificationsReconcileStateV1();
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('10', [incoming('1', '1'), incoming('2', '2')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  assert.equal(state.activeItemId, 'incoming:1');
  assert.deepEqual(state.passiveItemIds, ['incoming:2']);

  const boot = reconcileNotificationsSnapshotV1(
    state,
    snap('11', [incoming('2', '2'), incoming('3', '3')]),
  );
  // Active missing from incomplete boot snapshot → conflict, claim preserved
  assert.equal(boot.type, 'ACTIVE_ITEM_CONFLICT');
  if (boot.type === 'ACTIVE_ITEM_CONFLICT') {
    assert.equal(boot.itemId, 'incoming:1');
    assert.equal(boot.state.activeItemId, 'incoming:1');
    assert.ok(boot.state.itemsById['incoming:1']);
  }
  assertNoOwnerCommands(boot);
  const raw = JSON.stringify(boot);
  assert.doesNotMatch(raw, /sessionCompleted/);
  pass('race1: snapshot while active preserves claim; no sessionCompleted');
}

// —— Race 2: WS/delta then snapshot ———————————————————————
{
  let state = createInitialNotificationsReconcileStateV1();
  state = mustApplied(
    reconcileNotificationsSnapshotV1(state, snap('1', [incoming('2', '2')])),
  );
  // WS arrives older item via delta
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('1', '2', [
        {
          type: 'UPSERT_ITEM',
          revision: '2',
          item: incoming('1', '1'),
        },
      ]),
    ),
  );
  assert.deepEqual(state.passiveItemIds, ['incoming:1', 'incoming:2']);

  // Complete snapshot reconciles deterministically, oldest first
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('3', [
        incoming('2', '2'),
        incoming('1', '1'),
        incoming('3', '3'),
      ]),
    ),
  );
  assert.deepEqual(state.passiveItemIds, [
    'incoming:1',
    'incoming:2',
    'incoming:3',
  ]);
  assert.equal(state.activeItemId, null);
  pass('race2: delta then snapshot → sequence ASC; no blind wipe');
}

// —— Race 3: action target is active, not passive head ——————
{
  let state = createInitialNotificationsReconcileStateV1();
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('5', [incoming('1', '1'), incoming('2', '2')]),
    ),
  );
  // Activate newer item (not FIFO head)
  state = mustApplied(claimActiveItemV1(state, 'incoming:2'));
  assert.equal(state.passiveItemIds[0], 'incoming:1');
  assert.equal(state.activeItemId, 'incoming:2');
  const target = selectActionTargetV1(state);
  assert.equal(target.ok, true);
  if (target.ok) {
    assert.equal(target.itemId, 'incoming:2');
    assert.notEqual(target.itemId, state.passiveItemIds[0]);
  }
  const began = mustApplied(beginActionCaptureV1(state, 'act-1'));
  assert.equal(began.action.status, 'SUBMITTING');
  assert.equal(began.action.itemId, 'incoming:2');
  pass('race3: action target = activeItemId, never passiveItemIds[0]');
}

// —— Race 4: REMOVE + stale cannot resurrect; newer UPSERT can ——
{
  let state = createInitialNotificationsReconcileStateV1();
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('10', [incoming('1', '1'), incoming('2', '2')]),
    ),
  );
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('10', '11', [{ type: 'REMOVE_ITEM', revision: '11', itemId: 'incoming:1' }]),
    ),
  );
  assert.equal(state.itemsById['incoming:1'], undefined);
  assert.deepEqual(state.passiveItemIds, ['incoming:2']);

  // Stale snapshot (rev 9) ignored — cannot resurrect
  const stale = reconcileNotificationsSnapshotV1(
    state,
    snap('9', [incoming('1', '1'), incoming('2', '2')]),
  );
  assert.equal(stale.type, 'STALE_IGNORED');
  assert.equal(stale.state.itemsById['incoming:1'], undefined);

  // Duplicate/already-applied delta (fromRevision matches; revision <= current) idempotent
  const dup = reconcileNotificationsDeltaV1(
    state,
    delta('11', '11', [{ type: 'REMOVE_ITEM', revision: '11', itemId: 'incoming:1' }]),
  );
  assert.equal(dup.type, 'APPLIED');
  assert.equal(dup.state.itemsById['incoming:1'], undefined);

  // Genuinely newer UPSERT via valid delta resurrects under server revision semantics
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('11', '12', [
        {
          type: 'UPSERT_ITEM',
          revision: '12',
          item: incoming('1', '1', 'user-a', 'resurrected'),
        },
      ]),
    ),
  );
  assert.ok(state.itemsById['incoming:1']);
  assert.equal(
    state.itemsById['incoming:1']!.payload.kind === 'INCOMING_BAN'
      ? state.itemsById['incoming:1']!.payload.text
      : '',
    'resurrected',
  );
  pass('race4: REMOVE absent; stale ignored; newer UPSERT resurrects');
}

// —— Race 5: sync availability ————————————————————————————
{
  let state = createInitialNotificationsReconcileStateV1();
  assert.equal(selectNotificationsAvailabilityV1(state).available, false);

  state = setNotificationsSyncStatusV1(state, 'SYNCING');
  assert.deepEqual(selectNotificationsAvailabilityV1(state), {
    available: false,
    reason: 'SYNCING',
    retryable: true,
  });

  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('1', [incoming('1', '1')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  state = setNotificationsSyncStatusV1(state, 'RECOVERING');
  const recovering = selectNotificationsAvailabilityV1(state);
  assert.equal(recovering.available, false);
  assert.equal(state.activeItemId, 'incoming:1'); // preserved during recovery
  assert.ok(state.itemsById['incoming:1']);

  state = setNotificationsSyncStatusV1(state, 'READY');
  assert.equal(selectNotificationsAvailabilityV1(state).available, true);

  state = setNotificationsSyncStatusV1(state, 'FAILED');
  assert.deepEqual(selectNotificationsAvailabilityV1(state), {
    available: false,
    reason: 'FAILED',
    retryable: true,
  });
  pass('race5: unavailable SYNCING/RECOVERING/FAILED; READY available; active preserved');
}

// —— Additional matrix ————————————————————————————————————
{
  let state = createInitialNotificationsReconcileStateV1();
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('20', [
        resultFifo('r1', '3'),
        checkItem('c1', '2'),
        incoming('i1', '1'),
      ]),
    ),
  );
  assert.deepEqual(state.passiveItemIds, [
    'incoming:i1',
    'check:c1',
    'result:r1',
  ]);
  pass('matrix: multi-kind snapshot ordered by sequence');
}

{
  // HTTP snapshot vs WS delta → identical final state
  const items = [incoming('1', '1'), incoming('2', '2'), checkItem('c', '3')];
  const viaSnap = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('3', items),
    ),
  );
  let viaDelta = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('0', []),
    ),
  );
  viaDelta = mustApplied(
    reconcileNotificationsDeltaV1(
      viaDelta,
      delta('0', '3', [
        { type: 'UPSERT_ITEM', revision: '1', item: items[0]! },
        { type: 'UPSERT_ITEM', revision: '2', item: items[1]! },
        { type: 'UPSERT_ITEM', revision: '3', item: items[2]! },
      ]),
    ),
  );
  assert.deepEqual(viaSnap.passiveItemIds, viaDelta.passiveItemIds);
  assert.deepEqual(
    Object.keys(viaSnap.itemsById).sort(),
    Object.keys(viaDelta.itemsById).sort(),
  );
  assert.equal(viaSnap.revision, viaDelta.revision);
  pass('matrix: HTTP snapshot and WS delta → identical final state');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('5', [incoming('1', '1')]),
    ),
  );
  const before = state;
  const r = reconcileNotificationsDeltaV1(
    state,
    delta('5', '5', [
      { type: 'UPSERT_ITEM', revision: '5', item: incoming('1', '1') },
    ]),
  );
  assert.equal(r.type, 'APPLIED');
  assert.equal(r.state, before);
  pass('matrix: duplicate delta idempotent');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('5', [incoming('1', '1')]),
    ),
  );
  const gap = reconcileNotificationsDeltaV1(
    state,
    delta('4', '6', [
      { type: 'UPSERT_ITEM', revision: '6', item: incoming('2', '2') },
    ]),
  );
  assert.equal(gap.type, 'REVISION_GAP');
  if (gap.type === 'REVISION_GAP') {
    assert.equal(gap.expected, '5');
    assert.equal(gap.received, '4');
    assert.equal(gap.state.itemsById['incoming:2'], undefined);
  }
  pass('matrix: revision gap rejected atomically');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('10', [incoming('1', '1', 'user-a', 'old')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  state = mustApplied(
    reconcileNotificationsSnapshotV1(
      state,
      snap('11', [incoming('1', '1', 'user-a', 'updated'), incoming('2', '2')]),
    ),
  );
  assert.equal(state.activeItemId, 'incoming:1');
  assert.equal(
    state.itemsById['incoming:1']!.payload.kind === 'INCOMING_BAN'
      ? state.itemsById['incoming:1']!.payload.text
      : '',
    'updated',
  );
  assert.deepEqual(state.passiveItemIds, ['incoming:2']);
  pass('matrix: active payload updates; activation preserved; passives added');
}

{
  // Causal only with explicit cause — not same banId
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('1', [incoming('1', '1')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  const causal = resultCausal('1', '2', 'incoming:1');
  const other = resultCausal('9', '3', 'incoming:other');
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('1', '3', [
        { type: 'UPSERT_ITEM', revision: '2', item: causal },
        { type: 'UPSERT_ITEM', revision: '3', item: other },
      ]),
    ),
  );
  // Neither auto-claimed; not in passive (NEXT_IN_SESSION)
  assert.equal(state.causalNextItemId, null);
  assert.ok(!state.passiveItemIds.includes('result:1'));
  assert.ok(!state.passiveItemIds.includes('result:9'));

  assert.equal(
    selectCausalNextItemIdV1({
      itemsById: state.itemsById,
      completedItemId: 'incoming:1',
      confirmedCausalItemId: 'result:9',
      existingCausalNextItemId: null,
    }),
    null,
  );
  assert.equal(
    selectCausalNextItemIdV1({
      itemsById: state.itemsById,
      completedItemId: 'incoming:1',
      confirmedCausalItemId: 'result:1',
      existingCausalNextItemId: null,
    }),
    'result:1',
  );
  state = mustApplied(
    applyCausalNextClaimV1(state, {
      completedItemId: 'incoming:1',
      confirmedCausalItemId: 'result:1',
    }),
  );
  assert.equal(state.causalNextItemId, 'result:1');
  pass('matrix: causal NEXT_IN_SESSION only with explicit cause');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('1', [incoming('1', '1'), incoming('2', '2')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('1', '2', [
        { type: 'UPSERT_ITEM', revision: '2', item: incoming('3', '3') },
      ]),
    ),
  );
  assert.equal(state.activeItemId, 'incoming:1');
  assert.ok(state.passiveItemIds.includes('incoming:3'));
  // No auto-activation of next passive
  assert.notEqual(state.activeItemId, 'incoming:2');
  pass('matrix: independent items never replace active; no auto-activate');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('1', [incoming('1', '1'), incoming('2', '2')]),
    ),
  );
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('1', '2', [
        { type: 'REMOVE_ITEM', revision: '2', itemId: 'incoming:1' },
      ]),
    ),
  );
  assert.equal(state.itemsById['incoming:1'], undefined);
  assert.deepEqual(state.passiveItemIds, ['incoming:2']);
  pass('matrix: REMOVE passive works');
}

{
  let state = mustApplied(
    reconcileNotificationsSnapshotV1(
      createInitialNotificationsReconcileStateV1(),
      snap('1', [incoming('1', '1')]),
    ),
  );
  state = mustApplied(claimActiveItemV1(state, 'incoming:1'));
  const conflict = reconcileNotificationsDeltaV1(
    state,
    delta('1', '2', [
      { type: 'REMOVE_ITEM', revision: '2', itemId: 'incoming:1' },
    ]),
  );
  assert.equal(conflict.type, 'ACTIVE_ITEM_REMOVE_CONFLICT');
  assert.equal(conflict.state.activeItemId, 'incoming:1');
  assert.ok(conflict.state.itemsById['incoming:1']);

  // Authorized remove after action capture
  state = mustApplied(beginActionCaptureV1(state, 'act-42'));
  state = mustApplied(
    reconcileNotificationsDeltaV1(
      state,
      delta('1', '2', [
        { type: 'REMOVE_ITEM', revision: '2', itemId: 'incoming:1' },
      ]),
      { activeRemoveAuthorization: { actionId: 'act-42', itemId: 'incoming:1' } },
    ),
  );
  assert.equal(state.activeItemId, null);
  assert.equal(state.itemsById['incoming:1'], undefined);
  pass('matrix: REMOVE active without completion conflicts; authorized clears');
}

{
  const r = reconcileNotificationsSnapshotV1(
    createInitialNotificationsReconcileStateV1(),
    snap('1', [incoming('1', '1')]),
  );
  assertNoOwnerCommands(r);
  pass('matrix: no Coordinator/owner commands in reconcile result');
}

// —— Reachability: kernel not wired to production ——————————
{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  const bootstrap = readFileSync(
    join(runtimeDir, 'notification-runtime.bootstrap.ts'),
    'utf8',
  );
  const intents = readFileSync(
    join(runtimeDir, 'notification-runtime.intents.ts'),
    'utf8',
  );

  // Phase 8: reducer IS the reconcile authority. Transport must not call Sync API yet.
  for (const [name, src] of [
    ['transport', transport],
    ['bootstrap', bootstrap],
    ['intents', intents],
  ] as const) {
    assert.doesNotMatch(src, /\/notifications\/sync/, `${name} Sync API`);
    assert.doesNotMatch(src, /notifications:delta:v1/, `${name} WS V1`);
  }

  const reducer = readFileSync(
    join(runtimeDir, 'notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.match(reducer, /reconcileNotifications(Snapshot|Delta)V1/);
  assert.doesNotMatch(reducer, /items\.queue/);

  // Kernel deps: no React/HTTP/WS/Coordinator/Presenter imports
  const reconcileSrc = readFileSync(
    join(runtimeDir, 'notification-runtime.reconcile.ts'),
    'utf8',
  );
  assert.doesNotMatch(reconcileSrc, /from ['"]react['"]/);
  assert.doesNotMatch(reconcileSrc, /fetch\(|WebSocket|useWebSocket/);
  assert.doesNotMatch(
    reconcileSrc,
    /from ['"][^'"]*(app-coordinator|presenter|prisma)/i,
  );
  assert.doesNotMatch(reconcileSrc, /NotificationRuntimeTransport/);

  pass('reachability: reconcile is Runtime authority; Sync API not connected');
}

{
  // Dependency / naming: no RuntimeV2
  const files = readdirSync(runtimeDir);
  assert.ok(!files.some((f) => /v2|runtime-v2/i.test(f)));
  assert.ok(files.includes('notification-runtime.reconcile.ts'));
  assert.ok(files.includes('notification-runtime.sync-types.ts'));
  assert.ok(files.includes('notification-runtime.sequence.ts'));
  pass('naming: reconcile modules in Runtime area; no RuntimeV2');
}

console.log(`\n${passed} passed\n`);
