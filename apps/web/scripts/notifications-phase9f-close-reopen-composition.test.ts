/**
 * Stage 8 Phase 9F — Close → reopen Ban1 production composition.
 *
 * Cold SNAPSHOT Ban1/Ban2 → OPEN → Ban1 → CLOSE (Surface path) → Lobby →
 * AVAILABLE → OPEN → Ban1 again.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9f-close-reopen-composition.test.ts
 */
import assert from 'node:assert/strict';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { runNotificationsSyncViaMapper } from '../src/notification-runtime/notifications-mapper';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
} from '../src/notifications/presentation/notifications.presenter';
import {
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'cmpiebpwt00rgpk0p87dyblug';
const BAN1 = 'Ban1';
const BAN2 = 'Ban2';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'https://98plusapi-production.up.railway.app';

const snapshot = fixtureSnapshot({
  revision: '2',
  items: [
    fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
    fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
  ],
});

const origFetch = globalThis.fetch;

/** Exact NotificationsSurface CLOSE_PRESSED path (single SESSION_COMPLETE producer). */
function surfaceClose(life: ReturnType<typeof createAppCoordinatorLifecycle>) {
  const mapped = mapNotificationsUiEvent({ type: 'CLOSE_PRESSED' });
  assert.equal(mapped.kind, 'DOMAIN');
  assert.equal(mapped.intent.type, 'ACTIVE_ITEM_CLOSE_REQUESTED');
  life.dispatchDomainIntent({
    domain: 'NOTIFICATIONS',
    intent: mapped.intent,
  });
}

async function main() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /\/notifications\/sync$/);
    const headers = init?.headers as Record<string, string> | undefined;
    const auth =
      headers?.Authorization ??
      headers?.authorization ??
      (headers
        ? Object.values(headers).find((v) => String(v).startsWith('Bearer '))
        : null);
    assert.ok(auth && String(auth).startsWith('Bearer '));
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const store = createNotificationRuntimeStore();
  const sync = await runNotificationsSyncViaMapper(store, {
    token: 'test-token-phase9f',
  });
  assert.equal(sync.ok, true);
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().revision, '2');
  assert.deepEqual([...store.getState().passiveItemIds], [
    `incoming:${BAN1}`,
    `incoming:${BAN2}`,
  ]);
  pass('cold SNAPSHOT → READY Ban1/Ban2 passive');

  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'test-token-phase9f',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();

  let sessionCompleteCount = 0;
  const origSinkSession = (
    life.notificationsController as unknown as {
      // probe via wrapping dispatch path — count SESSION_COMPLETE effects instead
    }
  );
  void origSinkSession;

  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  assert.deepEqual([...store.getState().passiveItemIds], [`incoming:${BAN2}`]);
  {
    const owner = life.store.getState().currentOwner;
    assert.equal(owner.type, 'DOMAIN');
    if (owner.type === 'DOMAIN') assert.equal(owner.domain, 'NOTIFICATIONS');
  }
  const view1 = presentNotificationsState(life.notificationsController.getState());
  assert.equal(view1.phase, 'ITEM');
  if (view1.phase === 'ITEM') assert.equal(view1.itemId, `incoming:${BAN1}`);
  pass('OPEN → Ban1 visible');

  // Before Close expectations
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().revision, '2');
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  assert.deepEqual([...store.getState().passiveItemIds], [`incoming:${BAN2}`]);

  const effectsBeforeClose = store.getLastEffects();
  void effectsBeforeClose;

  surfaceClose(life);
  await new Promise((r) => setTimeout(r, 30));

  // After Close reducer expectations
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().revision, '2');
  assert.equal(store.getState().activeItemId, null);
  assert.deepEqual([...store.getState().passiveItemIds], [
    `incoming:${BAN1}`,
    `incoming:${BAN2}`,
  ]);
  assert.ok(store.getState().itemsById[`incoming:${BAN1}`]);
  assert.ok(store.getState().itemsById[`incoming:${BAN2}`]);
  assert.ok(store.getState().presentationByItemId[`incoming:${BAN1}`]);
  assert.ok(store.getState().presentationByItemId[`incoming:${BAN2}`]);

  // SESSION_COMPLETE exactly once on last close effects (may be cleared by later dispatches)
  // Re-close path already ran; verify via a fresh activate/close count below.
  {
    const owner = life.store.getState().currentOwner;
    assert.equal(owner.type, 'DOMAIN');
    if (owner.type === 'DOMAIN') assert.equal(owner.domain, 'CREATE_BAN');
  }
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  assert.equal(
    life.domainPorts.NOTIFICATIONS.getAvailability().availability,
    'AVAILABLE',
  );
  pass('CLOSE → Ban1 reinserted FIFO; owner Lobby; AVAILABLE');

  // Prove SESSION_COMPLETE once per close via isolated controller count
  {
    const store2 = createNotificationRuntimeStore();
    await runNotificationsSyncViaMapper(store2, { token: 't2' });
    let sessions = 0;
    const { createNotificationsController } = await import(
      '../src/notifications/notifications.controller'
    );
    const ctrl = createNotificationsController({
      store: store2,
      getToken: () => 't2',
      sink: {
        sessionCompleted: () => {
          sessions += 1;
        },
      },
    });
    ctrl.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
    ctrl.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED' });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sessions, 1);
    // no server ack / REMOVE — items remain
    assert.ok(store2.getState().itemsById[`incoming:${BAN1}`]);
    assert.equal(store2.getLastEffects().some((e) => e.type === 'SESSION_COMPLETE'), true);
    // second close with null active still emits SESSION_COMPLETE (EMPTY dismiss)
    // but controller sink is not re-entered here — effects only.
    store2.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
    assert.equal(
      store2.getLastEffects().some((e) => e.type === 'SESSION_COMPLETE'),
      true,
    );
    ctrl.dispose();
    sessionCompleteCount = sessions;
    pass(`SESSION_COMPLETE exactly once on Close (count=${sessionCompleteCount})`);
  }

  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  assert.deepEqual([...store.getState().passiveItemIds], [`incoming:${BAN2}`]);
  assert.deepEqual(
    life.notificationsController.getState().lastActivationOutcome,
    { type: 'ACTIVATED', itemId: `incoming:${BAN1}` },
  );
  {
    const owner = life.store.getState().currentOwner;
    assert.equal(owner.type, 'DOMAIN');
    if (owner.type === 'DOMAIN') assert.equal(owner.domain, 'NOTIFICATIONS');
  }
  const view2 = presentNotificationsState(life.notificationsController.getState());
  assert.equal(view2.phase, 'ITEM');
  if (view2.phase === 'ITEM') assert.equal(view2.itemId, `incoming:${BAN1}`);
  pass('second OPEN → Ban1 visible again (not Ban2)');

  // Close again, flip SYNCING (Phase 9E background sync), reopen must still work.
  surfaceClose(life);
  await new Promise((r) => setTimeout(r, 20));
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'bg-sync',
    source: 'user',
  });
  assert.equal(store.getState().syncStatus, 'SYNCING');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
  assert.deepEqual(
    life.notificationsController.getState().lastActivationOutcome,
    { type: 'ACTIVATED', itemId: `incoming:${BAN1}` },
  );
  const view3 = presentNotificationsState(life.notificationsController.getState());
  assert.equal(view3.phase, 'ITEM');
  if (view3.phase === 'ITEM') assert.equal(view3.itemId, `incoming:${BAN1}`);
  pass('Close → SYNCING background → second OPEN still activates Ban1');

  life.dispose();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = origFetch;
    if (process.exitCode !== 1) {
      console.log(`\n${passed} passed\n`);
    }
  });
