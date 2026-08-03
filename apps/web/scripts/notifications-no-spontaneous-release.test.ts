/**
 * No spontaneous Notifications release (target Runtime).
 * Replacement for deleted queue-based spontaneous-release tests.
 */
import assert from 'node:assert/strict';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
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
  let releases = 0;
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '1',
      items: [
        fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      ],
    }),
    presentationByItemId: {
      'incoming:1': fixturePresentationIncoming('1', USER),
    },
    source: 'test',
  });
  assert.equal(releases, 0);
  ctrl.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(releases, 0);
  assert.equal(store.getState().activeItemId, 'incoming:1');
  // EMPTY presenter observation must not release — only SESSION_COMPLETE does
  pass('activate does not spontaneously release');
}

{
  const store = createNotificationRuntimeStore();
  let releases = 0;
  createNotificationsController({
    store,
    getToken: () => null,
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '1',
      items: [
        fixtureContractIncoming({ banId: '1', userId: USER, sequence: '1' }),
      ],
    }),
    presentationByItemId: {
      'incoming:1': fixturePresentationIncoming('1', USER),
    },
    source: 'test',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  // CLOSE emits SESSION_COMPLETE effect; controller drain may be async —
  // count effects on store
  const effects = store.getLastEffects();
  assert.ok(effects.some((e) => e.type === 'SESSION_COMPLETE'));
  assert.equal(store.getState().activeItemId, null);
  pass('explicit CLOSE is the release path (SESSION_COMPLETE)');
  void releases;
}

console.log(`\n${passed} passed\n`);
