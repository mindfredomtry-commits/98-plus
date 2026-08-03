/**
 * FIFO ordering via explicit Contract V1 sequences (test fixtures).
 * Replaces deleted timestamp/queue FIFO tests.
 */
import assert from 'node:assert/strict';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const USER = 'u1';

function seed(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  revision: string,
  pairs: Array<[string, string]>,
) {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision,
      items: pairs.map(([banId, sequence]) =>
        fixtureContractIncoming({ banId, userId: USER, sequence }),
      ),
    }),
    source: 'test',
  });
}

console.log('\n=== FIFO (explicit Contract V1 sequence) ===\n');

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', [
    ['2', '2'],
    ['1', '1'],
  ]);
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  pass('1. Snapshot out-of-order → sequence ASC [1,2]');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '1', [['2', '2']]);
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'd',
    delta: {
      type: 'DELTA',
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
    },
    source: 'test',
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  pass('2. Delta older sequence inserts before newer');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', [
    ['1', '1'],
    ['2', '2'],
  ]);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'd',
    delta: {
      type: 'DELTA',
      fromRevision: '2',
      revision: '3',
      operations: [
        {
          type: 'UPSERT_ITEM',
          revision: '3',
          item: fixtureContractIncoming({
            banId: '0',
            userId: USER,
            sequence: '0',
          }),
        },
      ],
    },
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:0',
    'incoming:2',
  ]);
  pass('3. Activate 1; ingest older → active stays; passive sorted');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', [
    ['1', '1'],
    ['2', '2'],
  ]);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('4. Close then reopen; no auto-drain');
}

console.log(`\n${passed} passed\n`);
