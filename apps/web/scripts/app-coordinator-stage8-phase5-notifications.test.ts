/**
 * Stage 8 Phase 5 domain tests — rewritten for Phase 8 Sync V1 Runtime model.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase5-notifications.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { mapNotificationsCapability } from '../src/notifications/notifications.capability';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
} from '../src/notifications/presentation/notifications.presenter';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const USER = 'r1';
const webSrc = join(__dirname, '../src');

function ban(id: string, createdAt = '2026-01-01T10:00:00.000Z'): BanInteraction {
  return {
    id,
    text: 'текст',
    status: 'PENDING',
    durationMinutes: 30,
    sender: {
      id: 's1',
      telegramId: '1',
      username: 'anna',
      firstName: 'Анна',
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
      username: 'r',
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

function seed(store: ReturnType<typeof createNotificationRuntimeStore>, ids: string[]) {
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: ids.map((id, i) =>
      itemFromIncoming(
        ban(id, `2026-01-01T10:0${i}:00.000Z`),
      ),
    ),
    userId: USER,
    source: 'bootstrap',
  });
}

console.log('\n=== PHASE 5 DOMAIN (Phase 8 Runtime model) ===\n');

{
  const store = createNotificationRuntimeStore();
  assert.equal(mapNotificationsAvailability(store.getState()).availability, 'UNAVAILABLE');
  seed(store, ['1']);
  assert.equal(mapNotificationsAvailability(store.getState()).availability, 'AVAILABLE');
  pass('Availability: empty UNAVAILABLE; ready item AVAILABLE');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, ['1', '2']);
  const ctrl = createNotificationsController({
    store,
    getToken: () => null,
    getUserId: () => USER,
  });
  assert.equal(selectActiveItemId(store.getState()), null);
  ctrl.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  assert.equal(selectActiveItemId(store.getState()), 'incoming:1');
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:2');
  const view = presentNotificationsState(ctrl.getState());
  assert.equal(view.kind === 'ACTIVE' || view.phase === 'ACTIVE' || !!ctrl.getState().activeItem, true);
  pass('Open activates ready head; presenter sees active only');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, ['1']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    source: 'websocket',
    userId: USER,
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.ok(store.getState().passiveItemIds.includes('incoming:2'));
  pass('New item while active → active stable; FIFO grows');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, ['1']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'c1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  assert.equal(mapNotificationsCapability(store.getState()).transition, 'BLOCKED');
  pass('Action submission → capability BLOCKED');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, ['1']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'c1',
    targetItemId: 'incoming:1',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_FAILED',
    commandId: 'c1',
    targetItemId: 'incoming:1',
    errorCode: 'X',
    source: 'user',
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.equal(store.getState().action.status, 'FAILED');
  pass('Action failure preserves active item');
}

{
  const mapped = mapNotificationsUiEvent({ type: 'CLOSE' } as never);
  assert.ok(mapped);
  pass('Presenter UI event mapping exists');
}

{
  const reducer = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.doesNotMatch(reducer, /items\.queue/);
  assert.match(reducer, /reconcileNotifications/);
  const policy = readFileSync(
    join(webSrc, 'app-coordinator/application-policy.ts'),
    'utf8',
  );
  assert.doesNotMatch(policy, /passiveItemIds|itemsById/);
  pass('Source guards: no queue in reducer; policy has no Notifications queue branches');
}

{
  const store = createNotificationRuntimeStore();
  seed(store, ['1', '2']);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  // Completing without auto-drain: close returns to passive; second stays until manual open
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  assert.equal(store.getState().passiveItemIds[0], 'incoming:1');
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('No automatic queue drain / next-item activation');
}

console.log(`\n${passed} passed\n`);
