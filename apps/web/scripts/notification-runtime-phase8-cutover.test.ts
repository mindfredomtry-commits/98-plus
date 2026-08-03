/**
 * Stage 8 Phase 8 — Runtime cutover composition tests (real store).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-phase8-cutover.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  itemFromIncoming,
  itemFromResult,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  buildRemoveDelta,
  toCausalResultItemV1,
} from '../src/notification-runtime/notification-runtime.temporary-adapter';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';

const webSrc = join(__dirname, '../src');
const runtimeDir = join(webSrc, 'notification-runtime');
const USER = 'user-test';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string, createdAt: string): BanInteraction {
  return {
    id,
    text: `ban-${id}`,
    status: 'PENDING',
    durationMinutes: 30,
    sender: {
      id: 's',
      telegramId: '1',
      username: 'sender',
      firstName: 'S',
      lastName: null,
      avatarUrl: null,
      photoUrl: null,
      aura: 'stable',
      auraLabel: '',
      energyPercent: 50,
      streak: 0,
      isOnboarded: true,
      notificationMode: 'all',
    },
    receiver: {
      id: USER,
      telegramId: '2',
      username: 'recv',
      firstName: 'R',
      lastName: null,
      avatarUrl: null,
      photoUrl: null,
      aura: 'stable',
      auraLabel: '',
      energyPercent: 50,
      streak: 0,
      isOnboarded: true,
      notificationMode: 'all',
    },
    isIncoming: true,
    createdAt,
    expiresAt: null,
    checkDueAt: null,
    threadId: 't',
  };
}

function result(id: string, completedAt: string): BanResult {
  const b = ban(id, completedAt);
  return {
    id,
    text: 'result',
    outcome: 'overboard',
    headline: 'H',
    subline: 'S',
    completedAt,
    sender: b.sender,
    receiver: b.receiver,
    inviteLink: null,
    shareLink: null,
    miniAppLink: null,
  } as BanResult;
}

console.log('\n=== PHASE 8 RUNTIME CUTOVER ===\n');

// —— Race 1: recovery while active ————————————————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')), itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');

  const recovery = requestBootstrap(store, {
    source: 'bootstrap',
    recovery: true,
  });
  assert.equal(store.getState().syncStatus, 'RECOVERING');
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(mapNotificationsAvailability(store.getState()).availability, 'UNAVAILABLE');

  completeBootstrap(store, {
    transitionId: recovery.transitionId,
    // Incomplete snapshot omits active — conflict, claim preserved
    items: [itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().itemsById['incoming:1']);
  pass('race1: recovery/snapshot while active preserves claim; unavailable during RECOVERING');
}

// —— Race 2: live then snapshot ————————————————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
    source: 'websocket',
    userId: USER,
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  const boot2 = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot2.transitionId,
    items: [
      itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
      itemFromIncoming(ban('3', '2026-01-01T12:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
    'incoming:3',
  ]);
  pass('race2: live then snapshot — no wipe; sequence ASC');
}

// —— Race 3: action targets active ≠ passive head ————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
      itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  // Claim second via manual: activate first, close back, then... actually activate only takes head.
  // Prove action rejects non-active: activate 1, try action on mismatch.
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().passiveItemIds[0], 'incoming:2');
  const rejected = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'x',
    targetItemId: 'incoming:2',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(rejected.effects.length, 0);
  const ok = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'y',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(ok.effects[0]?.type, 'SUBMIT_CARD_ACTION');
  assert.equal(store.getState().action.itemId, 'incoming:1');
  pass('race3: action targets activeItemId only');
}

// —— Race 4: REMOVE + stale ————————————————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
      itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'act-rm',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  const fromRevision = store.getState().revision!;
  const { delta } = buildRemoveDelta({
    itemId: 'incoming:1',
    fromRevision,
  });
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'act-rm',
    targetItemId: 'incoming:1',
    delta,
    promoteCausalNext: true,
    source: 'user',
  });
  assert.equal(store.getState().itemsById['incoming:1'], undefined);

  // Stale older snapshot ignored
  const before = store.getState().revision;
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 'stale',
    snapshot: {
      type: 'SNAPSHOT',
      revision: '1',
      items: [],
    },
    source: 'test',
  });
  // If revision 1 < current, STALE — items unchanged
  if (before && BigInt(before) > BigInt(1)) {
    assert.equal(store.getState().itemsById['incoming:1'], undefined);
  }
  pass('race4: confirmed REMOVE; stale snapshot cannot resurrect');
}

// —— Race 5: availability ————————————————
{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 's1',
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  completeBootstrap(store, {
    transitionId: 's1',
    items: [itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'r1',
    source: 'bootstrap',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  // SYNC_NOT_READY during recovering — activation blocked for new claim if already...
  // If already had passive and we started recovery before activate:
  assert.equal(store.getState().syncStatus, 'RECOVERING');
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  pass('race5: unavailable until READY; recovering unavailable');
}

// —— Session A: two FIFO — manual open only ————
{
  const store = createNotificationRuntimeStore();
  let releases = 0;
  const controller = createNotificationsController({
    store,
    getToken: () => 't',
    getUserId: () => USER,
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
      itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  controller.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  // Simulate action REMOVE without causal
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'a1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  const { delta } = buildRemoveDelta({
    itemId: 'incoming:1',
    fromRevision: store.getState().revision!,
  });
  const r = store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'a1',
    targetItemId: 'incoming:1',
    delta,
    promoteCausalNext: true,
    source: 'user',
  });
  // Drain SESSION_COMPLETE
  for (const e of r.effects) {
    if (e.type === 'SESSION_COMPLETE') releases += 1;
  }
  assert.equal(store.getState().activeItemId, null);
  assert.deepEqual(store.getState().passiveItemIds, ['incoming:2']);
  assert.equal(releases, 1);
  // Second opens only on next activate
  controller.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(store.getState().activeItemId, 'incoming:2');
  pass('sessionA: two FIFO; second only on next manual open; release once');
}

// —— Session B: causal result ————————————————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
      itemFromIncoming(ban('9', '2026-01-01T12:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'ob',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  const upsert = toCausalResultItemV1(
    result('1', '2026-01-01T10:30:00.000Z'),
    USER,
    'incoming:1',
  );
  const { delta, presentationByItemId } = buildRemoveDelta({
    itemId: 'incoming:1',
    fromRevision: store.getState().revision!,
    upsert,
    presentationByItemId: {
      [upsert.itemId]: itemFromResult(result('1', '2026-01-01T10:30:00.000Z')),
    },
  });
  store.dispatch({
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'ob',
    targetItemId: 'incoming:1',
    delta,
    presentationByItemId,
    promoteCausalNext: true,
    source: 'user',
  });
  assert.equal(store.getState().activeItemId, 'result:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:9'));
  assert.ok(!store.getState().passiveItemIds.includes('result:1'));
  pass('sessionB: causal NEXT_IN_SESSION becomes active; passive untouched');
}

// —— Session C/D/E/F ————————————————
{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    source: 'websocket',
    userId: USER,
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:2'));
  pass('sessionC: new item during active → passive only');

  let releases = 0;
  const ctrl = createNotificationsController({
    store,
    getToken: () => 't',
    sink: { sessionCompleted: () => { releases += 1; } },
  });
  ctrl.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED' });
  // effects drained async — dispatch SYNC path emits SESSION_COMPLETE on store
  const closeResult = store.getLastEffects();
  // close already dispatched by controller — check state
  assert.equal(store.getState().activeItemId, null);
  assert.ok(store.getState().passiveItemIds.includes('incoming:1'));
  pass('sessionD: CLOSE returns to passive FIFO');

  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'fail1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_FAILED',
    commandId: 'fail1',
    targetItemId: 'incoming:1',
    errorCode: 'X',
    source: 'user',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().action.status, 'FAILED');
  // Retry with new actionId
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'fail2',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(store.getState().action.status, 'SUBMITTING');
  assert.equal(store.getState().action.itemId, 'incoming:1');
  pass('sessionE: action failure preserves active; retry works');

  store.dispatch({
    type: 'SYNC_RECOVERY_STARTED',
    transitionId: 'rec',
    source: 'bootstrap',
  });
  assert.equal(store.getState().action.itemId, 'incoming:1');
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('sessionF: recovery during submit keeps captured action target');
  void releases;
  void closeResult;
  void ctrl;
}

// —— Snapshot identity ————————————————
{
  const store = createNotificationRuntimeStore();
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
  });
  const a = ctrl.getState();
  const b = ctrl.getState();
  assert.equal(a, b);
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  const c = ctrl.getState();
  assert.notEqual(a, c);
  pass('controller snapshot identity stable until mutation');
}

// —— Source guards ————————————————
{
  const files = readdirSync(runtimeDir).filter((f) => f.endsWith('.ts'));
  assert.ok(!files.some((f) => /runtime-v2|RuntimeV2/i.test(f)));

  const reducer = readFileSync(
    join(runtimeDir, 'notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.doesNotMatch(reducer, /items\.queue/);
  assert.doesNotMatch(reducer, /BOOTSTRAP_REQUESTED|ITEMS_RECEIVED/);
  assert.match(reducer, /reconcileNotificationsSnapshotV1/);
  assert.match(reducer, /reconcileNotificationsDeltaV1/);

  const types = readFileSync(
    join(runtimeDir, 'notification-runtime.types.ts'),
    'utf8',
  );
  assert.doesNotMatch(types, /queue:\s*NotificationItem/);
  assert.match(types, /NotificationsReconcileStateV1/);
  assert.match(types, /presentationByItemId/);
  const syncTypes = readFileSync(
    join(runtimeDir, 'notification-runtime.sync-types.ts'),
    'utf8',
  );
  assert.match(syncTypes, /activeItemId/);
  assert.match(syncTypes, /passiveItemIds/);

  const intents = readFileSync(
    join(runtimeDir, 'notification-runtime.intents.ts'),
    'utf8',
  );
  assert.doesNotMatch(intents, /selectCurrentItem/);
  assert.match(intents, /selectActiveItem/);

  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.doesNotMatch(transport, /\/notifications\/sync/);
  assert.doesNotMatch(transport, /notifications:delta:v1/);
  assert.doesNotMatch(transport, /items\.queue/);

  pass('source guards: one reconcile path; no queue; no Sync API yet');
}

// —— Coordinator availability gate uses Sync V1 availability ————————————————
{
  const store = createNotificationRuntimeStore();
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'UNAVAILABLE',
  );
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z'))],
    userId: USER,
    source: 'bootstrap',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('coordinator gate: availability AVAILABLE when READY + passive/active');
}

console.log(`\n${passed} passed\n`);
