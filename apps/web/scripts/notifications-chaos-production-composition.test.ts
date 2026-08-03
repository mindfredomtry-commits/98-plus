/**
 * Stage 8 Phase 5 — production-composition Notifications chaos reproduction.
 *
 * These tests encode the REQUIRED contract. They are expected to FAIL on the
 * current baseline until the architectural fix lands. Failure messages name
 * the exact divergence proven by the audit.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-chaos-production-composition.test.ts
 *
 * NO production fix in this file — documentation of races only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import {
  selectApplicationSurfaceOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import {
  selectActiveItem,
  selectActiveItemId,
  selectCurrentItem,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createNotificationRuntimeStore,
  dismissRuntimeHead,
  nextRuntimeTransitionId,
} from '../src/notification-runtime/notification-runtime.store';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import { createNotificationIntents } from '../src/notification-runtime/notification-runtime.intents';

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function fail(name: string, err: unknown): void {
  failed += 1;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`FAIL — ${name}`);
  console.log(`       ${msg}`);
}

function ban(
  id: string,
  createdAt: string,
  text = id,
): BanInteraction {
  return {
    id,
    text,
    createdAt,
    status: 'pending',
    sender: {
      id: 'cmpiebpwt00rgpk0p87dyblug',
      firstName: 'B',
      username: 'b',
    },
    receiver: {
      id: 'cmpg2eide000etkgwbhkwjb5z',
      firstName: 'A',
      username: 'a',
    },
  } as BanInteraction;
}

const BAN1 = 'ban-older-1';
const BAN2 = 'ban-newer-2';
const ID1 = `incoming:${BAN1}`;
const ID2 = `incoming:${BAN2}`;

function queueIds(store: ReturnType<typeof createNotificationRuntimeStore>) {
  return store.getState().items.queue.map(notificationItemId);
}

/** Contract: BOOTSTRAP_REQUESTED must not wipe an ACTIVE Notifications session. */
function testBootstrapRequestedMustNotClearActiveClaim(): void {
  const name =
    'B/D: BOOTSTRAP_REQUESTED while ACTIVE must not clear claim / auto-release';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    let releaseReasons: string[] = [];
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    const originalDispatch = lifecycle.dispatch.bind(lifecycle);
    lifecycle.dispatch = (event) => {
      if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
        releaseReasons.push('NOTIFICATIONS_RELEASE_REQUESTED');
      }
      originalDispatch(event);
    };
    lifecycle.runtimePort.notifyBootCompleted();

    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'websocket',
    });
    assert.deepEqual(queueIds(runtimeStore), [ID1, ID2]);

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(selectApplicationSurfaceOwner(lifecycle.store.getState()), 'NOTIFICATIONS');
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID1);
    releaseReasons = [];

    // Mid-session hydrate (sync:session / reconnect) — production Transport calls this.
    requestBootstrap(runtimeStore, 'bootstrap');

    assert.equal(
      selectActiveItemId(runtimeStore.getState()),
      ID1,
      'active claim must survive BOOTSTRAP_REQUESTED',
    );
    assert.ok(
      queueIds(runtimeStore).includes(ID1),
      'active item must remain in queue across BOOTSTRAP_REQUESTED',
    );
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
      'owner must not auto-release from bootstrap wipe',
    );
    assert.deepEqual(
      releaseReasons,
      [],
      'BOOTSTRAP_REQUESTED must not produce NOTIFICATIONS_RELEASE via sessionCompleted',
    );
    pass(name);
    lifecycle.dispose();
  } catch (e) {
    fail(name, e);
  }
}

/** Contract: bootstrap success must not replace a richer WS queue with session.incoming alone. */
function testBootstrapCompletedMustNotDropWsItems(): void {
  const name =
    'B/C: BOOTSTRAP_COMPLETED must not replace WS [1,2] with session.incoming=[2]';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    const boot = requestBootstrap(runtimeStore, 'bootstrap');
    assert.ok(boot.transitionId);

    // WS races in during booting (common production timing).
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'websocket',
    });
    assert.deepEqual(queueIds(runtimeStore), [ID1, ID2]);

    // Session offers only newest incoming (server contract).
    completeBootstrap(runtimeStore, {
      transitionId: boot.transitionId!,
      items: [itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z'))],
      pendingItemIds: [ID2],
      sourceVersion: 'session:test',
      source: 'bootstrap',
    });

    assert.deepEqual(
      queueIds(runtimeStore),
      [ID1, ID2],
      `bootstrap must not drop WS Ban1; got ${queueIds(runtimeStore).join(',')}`,
    );
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

/** Contract: card action must target the ACTIVE item, not FIFO head when they diverge. */
function testActionMustTargetActiveNotReadyHead(): void {
  const name =
    'E: ACCEPT must target activeItemId when FIFO head differs from activation';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'websocket',
    });
    // Force active = Ban2 while FIFO head = Ban1 (late older ingest after claim).
    runtimeStore.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID1);
    // Clear and claim Ban2 explicitly by activating after removing Ban1 from front via
    // temporary activation of Ban2: simulate ACTIVE Ban2 with queue [1,2].
    runtimeStore.dispatch({
      type: 'CLEAR_ACTIVATION_REQUESTED',
      source: 'system',
    });
    // Manually set activation to Ban2 while keeping FIFO [1,2] via reducer path:
    // activate Ban1, ingest nothing, then we need ACTIVE=Ban2. Use store state hack
    // through ACTIVATE after rotating — claim Ban2 by completing Ban1 locally first
    // then undo… Simpler: dispatch ACTIVATE then ITEMS that keep both and set activation.
    runtimeStore.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    // After Ban1 active, append already present; force activation to Ban2 via CLEAR +
    // synthetic ACTIVE by activating when head is Ban2 only briefly.
    dismissRuntimeHead(runtimeStore, ID1, 'system', 'system');
    // Ban1 consumed locally; queue head Ban2; activate Ban2.
    runtimeStore.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID2);
    // Resurrect Ban1 into queue (pending refresh) — FIFO head becomes Ban1, active Ban2.
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'poll',
    });
    assert.equal(selectReadyHeadId(runtimeStore.getState()), ID1);
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID2);
    assert.equal(
      selectCurrentItem(runtimeStore.getState())
        ? notificationItemId(selectCurrentItem(runtimeStore.getState())!)
        : null,
      ID1,
    );

    const intents = createNotificationIntents({
      store: runtimeStore,
      getToken: () => 'tok',
    });
    // accept() uses selectCurrentItem (head), not active — contract requires active.
    const head = selectCurrentItem(runtimeStore.getState());
    const active = selectActiveItem(runtimeStore.getState());
    assert.ok(head && active);
    assert.equal(notificationItemId(active!), ID2);
    assert.notEqual(
      notificationItemId(head!),
      notificationItemId(active!),
      'precondition: head !== active',
    );

    // Production accept path keys off head.ban.id internally.
    assert.equal(
      head!.kind === 'incoming' ? head!.ban.id : null,
      BAN2,
      `ACCEPT must use active banId=${BAN2}; head is ${head!.kind === 'incoming' ? head!.ban.id : '?'} (action/ready-head split)`,
    );
    void intents;
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

/** Contract: locally consumed identity must not re-enter via pending ingest. */
function testConsumedMustNotResurrectFromPendingIngest(): void {
  const name =
    'F: pending refresh must not re-enqueue a locally consumed ban';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'websocket',
    });
    dismissRuntimeHead(runtimeStore, ID1, 'user_dismiss', 'user');
    assert.ok(runtimeStore.getState().consumed.itemIds.includes(ID1));
    assert.ok(!queueIds(runtimeStore).includes(ID1));

    // Same identity returns from GET /incoming/pending-all (still PENDING server-side
    // after local-only dismiss — known server gap; client must still honor consumed).
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'poll',
    });
    assert.ok(
      !queueIds(runtimeStore).includes(ID1),
      'consumed Ban1 must not reappear after pending ingest',
    );
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

/** Contract: availability must not be AVAILABLE during unstable BOOTING hydrate. */
function testAvailabilityDuringBooting(): void {
  const name =
    'H: availability must not be AVAILABLE while lifecycle=booting';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    requestBootstrap(runtimeStore, 'bootstrap');
    assert.equal(runtimeStore.getState().lifecycle.status, 'booting');
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    const avail = mapNotificationsAvailability(runtimeStore.getState());
    assert.equal(
      avail.availability,
      'UNAVAILABLE',
      'OPEN must not race mid-bootstrap AVAILABLE from WS-only head',
    );
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

/** Contract: open after bootstrap wipe flash must still present Ban1 then Ban2. */
function testHappyPathTwoManualOpens(): void {
  const name =
    'A: WS1→WS2→hydrate→open Ban1→complete→open Ban2 (deterministic)';
  try {
    const runtimeStore = createNotificationRuntimeStore();
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    lifecycle.runtimePort.notifyBootCompleted();

    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'websocket',
    });

    // Simulate late session hydrate that currently destroys WS state.
    const boot = requestBootstrap(runtimeStore, 'bootstrap');
    completeBootstrap(runtimeStore, {
      transitionId: boot.transitionId!,
      items: [itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z'))],
      pendingItemIds: [ID1, ID2],
      sourceVersion: 'session:late',
      source: 'bootstrap',
    });
    // Pending hydrate restores both (production after-bootstrap refresh).
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN1, '2026-08-03T10:00:00.000Z')),
      source: 'poll',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban(BAN2, '2026-08-03T10:01:00.000Z')),
      source: 'poll',
    });

    assert.deepEqual(queueIds(runtimeStore), [ID1, ID2]);

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID1);
    const view1 = presentNotificationsState(
      lifecycle.notificationsController.getState(),
    );
    assert.equal(view1.phase, 'ITEM');
    if (view1.phase === 'ITEM') {
      assert.equal(view1.itemId, ID1);
    }

    dismissRuntimeHead(runtimeStore, ID1, 'user_dismiss', 'user');
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(selectActiveItemId(runtimeStore.getState()), ID2);
    pass(name);
    lifecycle.dispose();
  } catch (e) {
    fail(name, e);
  }
}

/** Source inventory: document writers (always pass as audit checklist). */
function testSourceWriterInventory(): void {
  const name = 'Source inventory: bootstrap wipe + head≠active + no consumed filter';
  try {
    const root = process.cwd().endsWith('web')
      ? join(process.cwd(), 'src')
      : join(process.cwd(), 'apps/web/src');
    const reducer = readFileSync(
      join(root, 'notification-runtime/notification-runtime.reducer.ts'),
      'utf8',
    );
    assert.match(reducer, /items: \{ queue: \[\] \}/);
    assert.match(reducer, /activation: \{ type: 'INACTIVE' \}/);
    assert.match(reducer, /dedupeAppend\(\[\], filteredItems\)/);
    const intents = readFileSync(
      join(root, 'notification-runtime/notification-runtime.intents.ts'),
      'utf8',
    );
    assert.match(intents, /selectCurrentItem/);
    const ingest = readFileSync(
      join(root, 'notification-runtime/notification-runtime.ingest.ts'),
      'utf8',
    );
    assert.doesNotMatch(ingest, /consumed\.itemIds/);
    const avail = readFileSync(
      join(root, 'notifications/notifications.availability.ts'),
      'utf8',
    );
    assert.doesNotMatch(avail, /booting|recovering/);
    pass(name);
  } catch (e) {
    fail(name, e);
  }
}

function main(): void {
  console.log('\n=== Notifications chaos production-composition ===\n');
  testSourceWriterInventory();
  testBootstrapRequestedMustNotClearActiveClaim();
  testBootstrapCompletedMustNotDropWsItems();
  testActionMustTargetActiveNotReadyHead();
  testConsumedMustNotResurrectFromPendingIngest();
  testAvailabilityDuringBooting();
  testHappyPathTwoManualOpens();

  console.log(`\n${passed} passed, ${failed} failed (expected failures = proven races)\n`);
  // Exit 0 so CI can still run as audit report; failures are the evidence.
  if (failed === 0) {
    console.log(
      'WARNING: no failures — either races fixed or tests did not hit them.',
    );
  }
}

main();
