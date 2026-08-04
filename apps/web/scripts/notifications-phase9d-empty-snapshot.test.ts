/**
 * Stage 8 Phase 9D — empty SNAPSHOT → READY / EMPTY availability (cold Runtime).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9d-empty-snapshot.test.ts
 */
import assert from 'node:assert/strict';
import { createInitialNotificationsReconcileStateV1 } from '../src/notification-runtime/notification-runtime.sync-types';
import {
  reconcileNotificationsSnapshotV1,
  selectNotificationsAvailabilityV1,
} from '../src/notification-runtime/notification-runtime.reconcile';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { presentationMapFromItems } from '../src/notification-runtime/notifications-mapper';
import { fixtureContractIncoming } from './fixtures/notifications-contract-v1-fixture';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

{
  const initial = createInitialNotificationsReconcileStateV1();
  assert.equal(initial.revision, null);
  assert.equal(initial.syncStatus, 'UNINITIALIZED');
  pass('Runtime initial revision=null');
}

{
  const store = createNotificationRuntimeStore();
  assert.equal(store.getState().revision, null);
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'boot',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'boot',
    snapshot: { type: 'SNAPSHOT', revision: '0', items: [] },
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().revision, '0');
  assert.equal(Object.keys(store.getState().itemsById).length, 0);
  const avail = selectNotificationsAvailabilityV1(store.getState());
  assert.equal(avail.available, false);
  if (!avail.available) assert.equal(avail.reason, 'EMPTY');
  pass('Empty truthful SNAPSHOT revision=0 → READY + EMPTY availability');
}

{
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'b0',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'b0',
    snapshot: { type: 'SNAPSHOT', revision: '0', items: [] },
    presentationByItemId: {},
    source: 'bootstrap',
  });
  const item = fixtureContractIncoming({
    banId: 'post1',
    userId: 'user-a',
    sequence: '149',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'd1',
    delta: {
      type: 'DELTA',
      fromRevision: '0',
      revision: '149',
      operations: [{ type: 'UPSERT_ITEM', revision: '149', item }],
    },
    presentationByItemId: presentationMapFromItems([item]),
    source: 'websocket',
  });
  assert.equal(store.getState().revision, '149');
  assert.ok(store.getState().itemsById['incoming:post1']);
  pass('First post-reset Journal delta (revision>0) applies after empty SNAPSHOT');
}

{
  const state = createInitialNotificationsReconcileStateV1();
  const result = reconcileNotificationsSnapshotV1(state, {
    type: 'SNAPSHOT',
    revision: '0',
    items: [],
  });
  assert.equal(result.type, 'APPLIED');
  if (result.type === 'APPLIED') {
    assert.equal(result.state.revision, '0');
    assert.equal(result.state.syncStatus, 'READY');
    assert.deepEqual(Object.keys(result.state.itemsById), []);
  }
  pass('reconcile: revision=null accepts empty SNAPSHOT revision=0');
}

console.log(`\n${passed} passed\n`);
