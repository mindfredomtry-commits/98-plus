/**
 * Stage 8 Phase 5 domain invariants — rewritten against Sync V1 Runtime.
 * Availability closed until truthful READY snapshot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { mapNotificationsCapability } from '../src/notifications/notifications.capability';
import {
  fixtureContractIncoming,
  fixturePresentationIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const USER = 'r1';
const webSrc = join(__dirname, '../src');

function seedReady(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  ids: string[],
) {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'seed',
    snapshot: fixtureSnapshot({
      revision: String(ids.length),
      items: ids.map((id, i) =>
        fixtureContractIncoming({
          banId: id,
          userId: USER,
          sequence: String(i + 1),
        }),
      ),
    }),
    presentationByItemId: Object.fromEntries(
      ids.map((id) => [(`incoming:${id}` as const), fixturePresentationIncoming(id, USER)]),
    ),
    source: 'test',
  });
}

console.log('\n=== PHASE 5 DOMAIN (no synthetic authority) ===\n');

{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, { transitionId: boot.transitionId, source: 'bootstrap' });
  assert.equal(store.getState().syncStatus, 'FAILED');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  pass('Availability closed before truthful sync (FAILED)');
}

{
  const store = createNotificationRuntimeStore();
  seedReady(store, ['1']);
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
  });
  ctrl.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('Open activates ready head when READY');
}

{
  const store = createNotificationRuntimeStore();
  seedReady(store, ['1']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
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
            banId: '2',
            userId: USER,
            sequence: '2',
          }),
        },
      ],
    },
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:2'));
  pass('New item while active → active stable; passive grows');
}

{
  const store = createNotificationRuntimeStore();
  seedReady(store, ['1']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'c1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(mapNotificationsCapability(store.getState()).transition, 'BLOCKED');
  store.dispatch({
    type: 'CARD_ACTION_FAILED',
    commandId: 'c1',
    targetItemId: 'incoming:1',
    errorCode: 'X',
    source: 'user',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('Action targets active; failure preserves active; capability BLOCKED while submitting');
}

{
  const store = createNotificationRuntimeStore();
  seedReady(store, ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  assert.equal(store.getState().passiveItemIds[0], 'incoming:1');
  pass('No automatic queue drain');
}

{
  const reducer = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.doesNotMatch(reducer, /items\.queue/);
  assert.doesNotMatch(
    readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.bootstrap.ts'),
      'utf8',
    ),
    /temporary-adapter|epochMsSequence/,
  );
  pass('Source guards: no queue; no synthetic adapter in bootstrap');
}

console.log(`\n${passed} passed\n`);
