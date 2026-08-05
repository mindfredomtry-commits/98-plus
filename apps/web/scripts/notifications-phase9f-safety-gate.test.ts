/**
 * Stage 8 Phase 9F safety — open/activate gate + activation producer.
 *
 * Shared predicate: notification-runtime.open-gate.ts
 * (availability ≡ ACTIVATE_READY_ITEM_REQUESTED).
 *
 * SYNCING after Close (production):
 *   Close does not start sync.
 *   SYNC_STARTED arrives only from Transport runBootstrap → requestBootstrap:
 *     - reason 'user' (REQUEST_FULL_SYNC latch / refresh / pending drain)
 *     - reason 'bootstrap' (token/user remount)
 *     - reason 'reconnect' with forceFullSnapshot
 *   Those paths set syncStatus=SYNCING without clearing items (background HTTP).
 *   Conflict recovery keeps lastConflict (REVISION_GAP / ACTIVE_ITEM_* /
 *   INVALID_CONTRACT) across SYNC_STARTED → gate blocks until APPLY clears it.
 *   SYNC_RECOVERY_STARTED (reconnect incremental) → RECOVERING → always blocked.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9f-safety-gate.test.ts
 */
import assert from 'node:assert/strict';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectNotificationsMayActivateV1,
} from '../src/notification-runtime/notification-runtime.open-gate';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  fixtureContractIncoming,
  fixturePresentationIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'u';
const BAN1 = 'Ban1';
const BAN2 = 'Ban2';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

function seed(store: ReturnType<typeof createNotificationRuntimeStore>) {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '2',
      items: [
        fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
        fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
      ],
    }),
    presentationByItemId: {
      [`incoming:${BAN1}`]: fixturePresentationIncoming(BAN1, USER),
      [`incoming:${BAN2}`]: fixturePresentationIncoming(BAN2, USER),
    },
    source: 'test',
  });
}

function surfaceClose(
  life: ReturnType<typeof createAppCoordinatorLifecycle>,
) {
  life.dispatchDomainIntent({
    domain: 'NOTIFICATIONS',
    intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
  });
  life.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
}

function countActivations(store: ReturnType<typeof createNotificationRuntimeStore>) {
  let n = 0;
  const orig = store.dispatch.bind(store);
  (store as { dispatch: typeof store.dispatch }).dispatch = ((event) => {
    if (event.type === 'ACTIVATE_READY_ITEM_REQUESTED') n += 1;
    return orig(event);
  }) as typeof store.dispatch;
  return {
    get count() {
      return n;
    },
  };
}

// A. READY + Ban1/Ban2 → Close → background SYNCING → reopen Ban1
{
  const store = createNotificationRuntimeStore();
  seed(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  surfaceClose(life);
  assert.equal(store.getState().activeItemId, null);
  assert.deepEqual([...store.getState().passiveItemIds], [
    `incoming:${BAN1}`,
    `incoming:${BAN2}`,
  ]);
  // Background SYNCING — no conflict marker (not REVISION_GAP recovery).
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'bg',
    source: 'user',
  });
  assert.equal(store.getState().syncStatus, 'SYNCING');
  assert.equal(store.getState().lastConflict, null);
  assert.equal(store.getState().revision, '2');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  assert.equal(selectNotificationsMayActivateV1(store.getState()).available, true);
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  const view = presentNotificationsState(life.notificationsController.getState());
  assert.equal(view.phase, 'ITEM');
  if (view.phase === 'ITEM') assert.equal(view.itemId, `incoming:${BAN1}`);
  life.dispose();
  pass('A. Close → background SYNCING → reopen Ban1');
}

// B. RECOVERING + Ban1/Ban2 → OPEN blocked
{
  const store = createNotificationRuntimeStore();
  seed(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'rec',
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'RECOVERING');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  assert.deepEqual(selectNotificationsMayActivateV1(store.getState()), {
    available: false,
    reason: 'RECOVERING',
    retryable: true,
  });
  const counter = countActivations(store);
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(counter.count, 0);
  {
    const owner = life.store.getState().currentOwner;
    assert.equal(owner.type, 'DOMAIN');
    if (owner.type === 'DOMAIN') assert.equal(owner.domain, 'CREATE_BAN');
  }
  assert.equal(store.getState().activeItemId, null);
  life.dispose();
  pass('B. RECOVERING + items → OPEN blocked, zero activations');
}

// C. REVISION_GAP + passive items → no activation until full Snapshot succeeds
{
  const store = createNotificationRuntimeStore();
  seed(store);
  // Simulate gap: conflict + REQUEST_FULL_SYNC path preserves conflict on SYNCING.
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'gap',
    delta: {
      type: 'DELTA',
      fromRevision: '99',
      revision: '100',
      operations: [],
    },
    source: 'websocket',
  });
  assert.equal(store.getState().lastConflict?.type, 'REVISION_GAP');
  assert.ok(
    store.getLastEffects().some((e) => e.type === 'REQUEST_FULL_SYNC'),
  );
  assert.equal(
    selectNotificationsMayActivateV1(store.getState()).available,
    false,
  );
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'full',
    source: 'user',
  });
  assert.equal(store.getState().syncStatus, 'SYNCING');
  assert.equal(store.getState().lastConflict?.type, 'REVISION_GAP');
  assert.deepEqual(selectNotificationsMayActivateV1(store.getState()), {
    available: false,
    reason: 'CONFLICT',
    retryable: true,
  });
  const act = store.dispatch({
    type: 'ACTIVATE_READY_ITEM_REQUESTED',
    source: 'user',
  });
  assert.equal(act.activationOutcome?.type, 'SYNC_NOT_READY');
  assert.equal(store.getState().activeItemId, null);

  // Full Snapshot clears conflict → may activate.
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'full',
    snapshot: fixtureSnapshot({
      revision: '100',
      items: [
        fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
        fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
      ],
    }),
    presentationByItemId: {
      [`incoming:${BAN1}`]: fixturePresentationIncoming(BAN1, USER),
      [`incoming:${BAN2}`]: fixturePresentationIncoming(BAN2, USER),
    },
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().lastConflict, null);
  assert.equal(selectNotificationsMayActivateV1(store.getState()).available, true);
  const ok = store.dispatch({
    type: 'ACTIVATE_READY_ITEM_REQUESTED',
    source: 'user',
  });
  assert.equal(ok.activationOutcome?.type, 'ACTIVATED');
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  pass('C. REVISION_GAP blocks until Snapshot; then Ban1 activates');
}

// D. ACTIVE_ITEM_CONFLICT recovery → no stale activation
{
  const store = createNotificationRuntimeStore();
  seed(store);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  // Snapshot omitting active → ACTIVE_ITEM_CONFLICT
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'c',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'c',
    snapshot: fixtureSnapshot({
      revision: '3',
      items: [
        fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
      ],
    }),
    presentationByItemId: {
      [`incoming:${BAN2}`]: fixturePresentationIncoming(BAN2, USER),
    },
    source: 'bootstrap',
  });
  assert.equal(store.getState().lastConflict?.type, 'ACTIVE_ITEM_CONFLICT');
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  assert.equal(
    selectNotificationsMayActivateV1(store.getState()).available,
    false,
  );
  // Clear active into passive then try activate during conflict — blocked.
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  const blocked = store.dispatch({
    type: 'ACTIVATE_READY_ITEM_REQUESTED',
    source: 'user',
  });
  assert.equal(blocked.activationOutcome?.type, 'SYNC_NOT_READY');
  pass('D. ACTIVE_ITEM_CONFLICT → no stale activation');
}

// E. normal OPEN exactly once
{
  const store = createNotificationRuntimeStore();
  seed(store);
  const counter = countActivations(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(counter.count, 1);
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  life.dispose();
  pass('E. normal OPEN → exactly one ACTIVATE_READY_ITEM_REQUESTED');
}

// F. QUEUED OPEN exactly once
{
  const store = createNotificationRuntimeStore();
  seed(store);
  const counter = countActivations(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(counter.count, 1);
  let nested = false;
  life.store.subscribe((_s, _p, event) => {
    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED' && !nested) {
      nested = true;
      life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    }
  });
  const beforeNested = counter.count;
  surfaceClose(life);
  // Nested OPEN during RELEASE must produce exactly one additional activate.
  assert.equal(counter.count, beforeNested + 1);
  life.dispose();
  pass('F. QUEUED OPEN → exactly one activation after application');
}

// G. rejected OPEN zero activations
{
  const store = createNotificationRuntimeStore();
  // No snapshot — EMPTY / not available after boot without items.
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'empty',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'empty',
    snapshot: fixtureSnapshot({ revision: '0', items: [] }),
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  const counter = countActivations(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(counter.count, 0);
  assert.equal(store.getState().activeItemId, null);
  life.dispose();
  pass('G. rejected OPEN → zero activations');
}

// Shared predicate identity: availability === mayActivate
{
  const store = createNotificationRuntimeStore();
  seed(store);
  assert.deepEqual(
    mapNotificationsAvailability(store.getState()).availability === 'AVAILABLE',
    selectNotificationsMayActivateV1(store.getState()).available,
  );
  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'r',
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  assert.equal(selectNotificationsMayActivateV1(store.getState()).available, false);
  pass('availability and mayActivate share the same predicate');
}

console.log(`\n${passed} passed\n`);
