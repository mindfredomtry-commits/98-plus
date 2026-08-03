/**
 * Controller getState snapshot identity (useSyncExternalStore).
 */
import assert from 'node:assert/strict';
import { createNotificationsController } from '../src/notifications/notifications.controller';
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

{
  const store = createNotificationRuntimeStore();
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
  });
  const a = ctrl.getState();
  const b = ctrl.getState();
  assert.equal(a, b);
  pass('repeated getState same reference');

  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '1',
      items: [
        fixtureContractIncoming({ banId: '1', userId: 'u', sequence: '1' }),
      ],
    }),
    source: 'test',
  });
  const c = ctrl.getState();
  assert.notEqual(a, c);
  const d = ctrl.getState();
  assert.equal(c, d);
  pass('mutation produces one new reference');
}

console.log(`\n${passed} passed\n`);
