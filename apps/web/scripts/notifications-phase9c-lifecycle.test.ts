/**
 * Stage 8 Phase 9C — Runtime: unanswered items persist; empty SNAPSHOT → READY.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9c-lifecycle.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fixtureContractCheck,
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';
import { presentationMapFromItems } from '../src/notification-runtime/notifications-mapper';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { selectNotificationsAvailabilityV1 } from '../src/notification-runtime/notification-runtime.reconcile';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

{
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'e0',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'e0',
    snapshot: fixtureSnapshot({ revision: '0', items: [] }),
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(Object.keys(store.getState().itemsById).length, 0);
  const avail = selectNotificationsAvailabilityV1(store.getState());
  assert.equal(avail.available, false);
  assert.equal(avail.reason, 'EMPTY');
  pass('8. Empty Journal SNAPSHOT → READY; empty availability');
}

{
  const incoming = fixtureContractIncoming({
    banId: 'stay1',
    userId: 'user-a',
    sequence: '1',
  });
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'i0',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'i0',
    snapshot: fixtureSnapshot({ revision: '1', items: [incoming] }),
    presentationByItemId: presentationMapFromItems([incoming]),
    source: 'bootstrap',
  });
  // Elapsed wall-clock cannot remove items — only Sync deltas can.
  assert.ok(store.getState().itemsById['incoming:stay1']);
  assert.equal(store.getState().itemsById['incoming:stay1']?.kind, 'INCOMING_BAN');
  pass('2. Unanswered incoming remains in Runtime until explicit action/delta');
}

{
  const check = fixtureContractCheck({
    banId: 'stay2',
    userId: 'user-a',
    sequence: '2',
  });
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'c0',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'c0',
    snapshot: fixtureSnapshot({ revision: '2', items: [check] }),
    presentationByItemId: presentationMapFromItems([check]),
    source: 'bootstrap',
  });
  assert.ok(store.getState().itemsById['check:stay2']);
  assert.equal(store.getState().itemsById['check:stay2']?.kind, 'CHECK_REQUEST');
  pass('3. Unanswered CHECK_REQUEST remains until explicit answer');
}

{
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'n0',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'n0',
    snapshot: fixtureSnapshot({ revision: '0', items: [] }),
    presentationByItemId: {},
    source: 'bootstrap',
  });
  const first = fixtureContractIncoming({
    banId: 'new1',
    userId: 'user-a',
    sequence: '1',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'n1',
    delta: {
      type: 'DELTA',
      fromRevision: '0',
      revision: '1',
      operations: [
        { type: 'UPSERT_ITEM', revision: '1', item: first },
      ],
    },
    presentationByItemId: presentationMapFromItems([first]),
    source: 'websocket',
  });
  assert.equal(Object.keys(store.getState().itemsById).length, 1);
  assert.ok(store.getState().itemsById['incoming:new1']);
  pass('9. First post-reset Ban Journal item appears via truthful delta');
}

{
  // After global reset: cold boot (null revision) applies empty SNAPSHOT.
  // Stale local revision cannot resurrect deleted Ban items once store resets
  // (Mini App close/reopen / RESET_REQUESTED before bootstrap).
  const cold = createNotificationRuntimeStore();
  cold.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'cold',
    source: 'bootstrap',
  });
  cold.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'cold',
    snapshot: fixtureSnapshot({ revision: '0', items: [] }),
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(Object.keys(cold.getState().itemsById).length, 0);
  assert.equal(cold.getState().revision, '0');

  // Warm store with history then RESET → empty Sync replaces authority
  const warm = createNotificationRuntimeStore();
  const old = fixtureContractIncoming({
    banId: 'ghost',
    userId: 'user-a',
    sequence: '9',
  });
  warm.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'g0',
    source: 'bootstrap',
  });
  warm.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'g0',
    snapshot: fixtureSnapshot({ revision: '9', items: [old] }),
    presentationByItemId: presentationMapFromItems([old]),
    source: 'bootstrap',
  });
  assert.ok(warm.getState().itemsById['incoming:ghost']);
  warm.dispatch({ type: 'RESET_REQUESTED', source: 'system' });
  warm.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'g1',
    source: 'bootstrap',
  });
  warm.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'g1',
    snapshot: fixtureSnapshot({ revision: '0', items: [] }),
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(warm.getState().itemsById['incoming:ghost'], undefined);
  assert.equal(Object.keys(warm.getState().itemsById).length, 0);
  pass('10. Deleted Ban history cannot reappear after reset + empty Sync SNAPSHOT');
}

{
  const apiBan = readFileSync(
    join(
      __dirname,
      '../../api/src/services/ban.service.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(apiBan, /opsTimeoutResult/);
  const scheduler = readFileSync(
    join(__dirname, '../../api/src/jobs/scheduler.ts'),
    'utf8',
  );
  assert.doesNotMatch(scheduler, /processStaleChecks/);
  pass('web+api: TIMEOUT execution removed from production path');
}

console.log(`\n${passed} passed\n`);
