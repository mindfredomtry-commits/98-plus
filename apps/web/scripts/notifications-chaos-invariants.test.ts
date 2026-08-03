/**
 * Chaos / product invariants preserved after synthetic-authority removal.
 * Replaces obsolete queue/bootstrap chaos composition that asserted deleted architecture.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-chaos-invariants.test.ts
 */
import assert from 'node:assert/strict';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import {
  fixtureContractIncoming,
  fixturePresentationIncoming,
  fixtureRemoveThenUpsertDelta,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const USER = 'chaos-user';

function seed(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  revision: string,
  ids: string[],
) {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'seed',
    snapshot: fixtureSnapshot({
      revision,
      items: ids.map((id, i) =>
        fixtureContractIncoming({
          banId: id,
          userId: USER,
          sequence: String(i + 1),
        }),
      ),
    }),
    presentationByItemId: Object.fromEntries(
      ids.map((id) => [`incoming:${id}`, fixturePresentationIncoming(id, USER)]),
    ),
    source: 'test',
  });
}

console.log('\n=== CHAOS INVARIANTS (target Runtime) ===\n');

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'r',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'r',
    snapshot: fixtureSnapshot({
      revision: '3',
      items: [
        fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
      ],
    }),
    source: 'test',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('active item cannot be wiped by recovery');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().passiveItemIds[0], 'incoming:2');
  const bad = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'bad',
    targetItemId: 'incoming:2',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(bad.effects.length, 0);
  pass('action targets visible active item only');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '10', ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'rm',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'rm',
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
      revision: '5',
      items: [
        fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      ],
    }),
    source: 'test',
  });
  assert.equal(store.getState().itemsById['incoming:1'], undefined);
  pass('processed item cannot resurrect via stale snapshot');
}

{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 's',
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  pass('availability closed before truthful sync');
}

{
  const store = createNotificationRuntimeStore();
  let releases = 0;
  createNotificationsController({
    store,
    getToken: () => null,
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  seed(store, '1', ['1']);
  assert.equal(releases, 0);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(releases, 0);
  pass('no spontaneous release on sync/activate');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, '2', ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  assert.equal(store.getState().passiveItemIds.includes('incoming:2'), true);
  assert.equal(store.getState().passiveItemIds[0], 'incoming:1');
  pass('no automatic passive drain on close');
}

console.log(`\n${passed} passed\n`);
