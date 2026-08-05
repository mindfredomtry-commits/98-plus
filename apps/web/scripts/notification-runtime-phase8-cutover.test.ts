/**
 * Stage 8 correction — Runtime cutover without synthetic sequence/revision.
 *
 * Production adapter removed. Tests inject truthful Contract V1 SNAPSHOT/DELTA
 * via scripts/fixtures only.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-phase8-cutover.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import { receiveNotificationItem } from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import {
  fixtureContractIncoming,
  fixtureContractResult,
  fixtureDelta,
  fixturePresentationIncoming,
  fixturePresentationResult,
  fixtureRemoveThenUpsertDelta,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const webSrc = join(__dirname, '../src');
const runtimeDir = join(webSrc, 'notification-runtime');
const USER = 'user-test';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function applySnapshot(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  revision: string,
  items: ReturnType<typeof fixtureContractIncoming>[],
  presentation?: Record<string, ReturnType<typeof fixturePresentationIncoming>>,
) {
  const tid = requestBootstrap(store, { source: 'test' }).transitionId;
  // Force READY path: dispatch APPLY directly with fixture (truthful test input)
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: tid,
    snapshot: fixtureSnapshot({ revision, items }),
    presentationByItemId: presentation,
    source: 'test',
  });
}

console.log('\n=== PHASE 8 CORRECTION (no synthetic authority) ===\n');

// —— Production sync leaves Runtime unavailable ——————————
{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  assert.equal(store.getState().syncStatus, 'SYNCING');
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    source: 'bootstrap',
    items: [{ fake: true }],
  });
  assert.equal(store.getState().syncStatus, 'FAILED');
  assert.equal(store.getState().revision, null);
  assert.deepEqual(Object.keys(store.getState().itemsById), []);
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  // Ingest blocked
  receiveNotificationItem(store, {
    item: fixturePresentationIncoming('1', USER),
    source: 'websocket',
    userId: USER,
  });
  assert.deepEqual(Object.keys(store.getState().itemsById), []);
  pass('production bootstrap/ingest: FAILED + empty; unavailable; no item writes');
}

// —— Race 1: recovery while active (fixture SNAPSHOT) ————
{
  const store = createNotificationRuntimeStore();
  applySnapshot(
    store,
    '10',
    [
      fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
    ],
    {
      'incoming:1': fixturePresentationIncoming('1', USER),
      'incoming:2': fixturePresentationIncoming('2', USER),
    },
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');

  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'rec',
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'RECOVERING');
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );

  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'rec',
    snapshot: fixtureSnapshot({
      revision: '11',
      items: [
        fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
      ],
    }),
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().itemsById['incoming:1']);
  pass('race1: recovery snapshot omitting active preserves claim');
}

// —— Race 2: delta then snapshot ————————————————
{
  const store = createNotificationRuntimeStore();
  applySnapshot(store, '1', [
    fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
  ]);
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'd1',
    delta: fixtureDelta({
      fromRevision: '1',
      revision: '2',
      operations: [
        {
          type: 'UPSERT_ITEM',
          revision: '2',
          item: fixtureContractIncoming({
            banId: '1',
            userId: USER,
            sequence: '1',
          }),
        },
      ],
    }),
    source: 'test',
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  applySnapshot(store, '3', [
    fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
    fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
    fixtureContractIncoming({ banId: '3', userId: USER, sequence: '3' }),
  ]);
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
    'incoming:3',
  ]);
  pass('race2: live delta then snapshot — no wipe; sequence ASC');
}

// —— Race 3: action targets active ————————————————
{
  const store = createNotificationRuntimeStore();
  applySnapshot(
    store,
    '5',
    [
      fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
    ],
    {
      'incoming:1': fixturePresentationIncoming('1', USER),
      'incoming:2': fixturePresentationIncoming('2', USER),
    },
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().passiveItemIds[0], 'incoming:2');
  const rejected = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'x',
    targetItemId: 'incoming:2',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(rejected.effects.length, 0);
  const ok = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'y',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(ok.effects[0]?.type, 'SUBMIT_CARD_ACTION');
  assert.equal(store.getState().action.itemId, 'incoming:1');
  pass('race3: action targets activeItemId only');
}

// —— Race 4: REMOVE + stale ————————————————
{
  const store = createNotificationRuntimeStore();
  applySnapshot(store, '10', [
    fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
    fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
  ]);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'act-rm',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'act-rm',
    targetItemId: 'incoming:1',
    delta: fixtureRemoveThenUpsertDelta({
      fromRevision: '10',
      removeItemId: 'incoming:1',
      removeRevision: '11',
    }),
    promoteCausalNext: true,
    source: 'test',
  });
  assert.equal(store.getState().itemsById['incoming:1'], undefined);
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'stale',
    snapshot: fixtureSnapshot({
      revision: '1',
      items: [
        fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      ],
    }),
    source: 'test',
  });
  assert.equal(store.getState().itemsById['incoming:1'], undefined);
  pass('race4: confirmed REMOVE; stale snapshot cannot resurrect');
}

// —— Race 5: availability closed before truthful sync ————
{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 's1',
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  applySnapshot(store, '1', [
    fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
  ]);
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'r1',
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  pass('race5: cold SYNCING blocked; items stay AVAILABLE during RECOVERING');
}

// —— Sessions A/B/C/D/E ————————————————
{
  const store = createNotificationRuntimeStore();
  let releases = 0;
  applySnapshot(
    store,
    '20',
    [
      fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
    ],
    {
      'incoming:1': fixturePresentationIncoming('1', USER),
      'incoming:2': fixturePresentationIncoming('2', USER),
    },
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'a1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  const r = store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'a1',
    targetItemId: 'incoming:1',
    delta: fixtureRemoveThenUpsertDelta({
      fromRevision: store.getState().revision!,
      removeItemId: 'incoming:1',
      removeRevision: '21',
    }),
    promoteCausalNext: true,
    source: 'test',
  });
  for (const e of r.effects) {
    if (e.type === 'SESSION_COMPLETE') releases += 1;
  }
  assert.equal(store.getState().activeItemId, null);
  assert.deepEqual(store.getState().passiveItemIds, ['incoming:2']);
  assert.equal(releases, 1);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:2');
  pass('sessionA: two FIFO; second only on next manual open; release once');
}

{
  const store = createNotificationRuntimeStore();
  applySnapshot(
    store,
    '1',
    [
      fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      fixtureContractIncoming({ banId: '9', userId: USER, sequence: '9' }),
    ],
    {
      'incoming:1': fixturePresentationIncoming('1', USER),
      'incoming:9': fixturePresentationIncoming('9', USER),
    },
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'ob',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  const upsert = fixtureContractResult({
    banId: '1',
    userId: USER,
    sequence: '2',
    deliveryPolicy: 'NEXT_IN_SESSION',
    causedByItemId: 'incoming:1',
  });
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'ob',
    targetItemId: 'incoming:1',
    delta: fixtureRemoveThenUpsertDelta({
      fromRevision: '1',
      removeItemId: 'incoming:1',
      removeRevision: '2',
      upsert,
      upsertRevision: '3',
    }),
    presentationByItemId: {
      'result:1': fixturePresentationResult('1', USER),
    },
    promoteCausalNext: true,
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'result:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:9'));
  pass('sessionB: causal NEXT_IN_SESSION becomes active');
}

{
  const store = createNotificationRuntimeStore();
  applySnapshot(
    store,
    '1',
    [fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' })],
    { 'incoming:1': fixturePresentationIncoming('1', USER) },
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'n',
    delta: fixtureDelta({
      fromRevision: '1',
      revision: '2',
      operations: [
        {
          type: 'UPSERT_ITEM',
          revision: '2',
          item: fixtureContractIncoming({
            banId: '2',
            userId: USER,
            sequence: '2',
          }),
        },
      ],
    }),
    presentationByItemId: {
      'incoming:2': fixturePresentationIncoming('2', USER),
    },
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:2'));
  pass('sessionC: new item during active → passive only');

  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  assert.ok(store.getState().passiveItemIds.includes('incoming:1'));
  pass('sessionD: CLOSE returns to passive FIFO');

  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'fail1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_FAILED',
    commandId: 'fail1',
    targetItemId: 'incoming:1',
    errorCode: 'X',
    source: 'user',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().action.status, 'FAILED');
  pass('sessionE: action failure preserves active');
}

// —— Snapshot identity / no spontaneous release ————
{
  const store = createNotificationRuntimeStore();
  let releases = 0;
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  const a = ctrl.getState();
  const b = ctrl.getState();
  assert.equal(a, b);
  applySnapshot(store, '1', [
    fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
  ]);
  assert.notEqual(ctrl.getState(), a);
  assert.equal(releases, 0);
  pass('snapshot identity; no spontaneous release on ingest');
}

// —— Source guards: no synthetic authority in production ————
{
  const srcFiles = readdirSync(runtimeDir).filter((f) => f.endsWith('.ts'));
  assert.ok(!srcFiles.includes('notification-runtime.temporary-adapter.ts'));

  for (const f of srcFiles) {
    const src = readFileSync(join(runtimeDir, f), 'utf8');
    assert.doesNotMatch(
      src,
      /epochMsSequence|Date\.parse\([^)]*\)[\s\S]{0,80}sequence/,
      `${f} must not derive sequence from timestamps`,
    );
    assert.doesNotMatch(
      src,
      /sequence\s*=\s*String\(Math\.trunc|sequence:\s*epochMs/,
      `${f} no epoch sequence`,
    );
  }

  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.doesNotMatch(transport, /temporary-adapter/);
  assert.doesNotMatch(transport, /receiveNotificationItem/);
  assert.doesNotMatch(transport, /pending-all|fetchPendingChainPrefetch/);
  assert.match(transport, /runNotificationsSyncViaMapper|notifications:delta:v1|isNotificationsDeltaV1Event/);
  assert.match(transport, /\/notifications\/sync|runNotificationsSyncViaMapper/);

  const ingest = readFileSync(
    join(runtimeDir, 'notification-runtime.ingest.ts'),
    'utf8',
  );
  assert.match(ingest, /Intentionally a no-op|awaiting truthful Sync/i);
  assert.doesNotMatch(ingest, /APPLY_NOTIFICATIONS_/);

  const bootstrap = readFileSync(
    join(runtimeDir, 'notification-runtime.bootstrap.ts'),
    'utf8',
  );
  // Legacy completeBootstrap still fails closed if called without Sync.
  assert.match(bootstrap, /AWAITING_TRUTHFUL_SYNC/);
  assert.doesNotMatch(bootstrap, /APPLY_NOTIFICATIONS_SNAPSHOT/);

  // Fixture lives under scripts only
  const fixture = readFileSync(
    join(__dirname, 'fixtures/notifications-contract-v1-fixture.ts'),
    'utf8',
  );
  assert.match(fixture, /TEST FIXTURE ONLY/);

  const reducer = readFileSync(
    join(runtimeDir, 'notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.doesNotMatch(reducer, /items\.queue/);
  assert.match(reducer, /reconcileNotifications/);

  pass('source guards: no production synthetic sequence/revision; no queue writers');
}

console.log(`\n${passed} passed\n`);
