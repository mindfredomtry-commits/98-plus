/**
 * Manual open with two items — target Runtime (fixture SNAPSHOT).
 * Production open remains unavailable until Phase 9 truthful sync.
 */
import assert from 'node:assert/strict';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
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

const USER = 'u';

{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, { transitionId: boot.transitionId, source: 'bootstrap' });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  pass('production path: open unavailable without truthful sync');
}

{
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '2',
      items: [
        fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
        fixtureContractIncoming({ banId: '2', userId: USER, sequence: '2' }),
      ],
    }),
    presentationByItemId: {
      'incoming:1': fixturePresentationIncoming('1', USER),
      'incoming:2': fixturePresentationIncoming('2', USER),
    },
    source: 'test',
  });
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
  });
  ctrl.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().passiveItemIds[0], 'incoming:2');
  pass('two items: manual activate claims first; second stays passive');
}

console.log(`\n${passed} passed\n`);
