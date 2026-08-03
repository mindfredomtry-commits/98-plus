/**
 * Stage 8 Phase 8 — FIFO via temporary adapter sequence (createdAt → sequence).
 * Replaces deleted items.queue FIFO tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-fifo-order.test.ts
 */
import assert from 'node:assert/strict';
import type { BanInteraction } from '@98plus/shared';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const USER = 'u1';

function ban(id: string, createdAt: string): BanInteraction {
  return {
    id,
    text: id,
    status: 'PENDING',
    durationMinutes: 30,
    sender: {
      id: 's',
      telegramId: '1',
      username: 's',
      firstName: 'S',
      lastName: null,
      avatarUrl: null,
      photoUrl: null,
      aura: 'stable',
      auraLabel: '',
      energyPercent: 0,
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
      energyPercent: 0,
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

console.log('\n=== FIFO (Sync V1 temporary sequence) ===\n');

{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [],
    userId: USER,
    source: 'bootstrap',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
    source: 'websocket',
    userId: USER,
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
    source: 'poll',
    userId: USER,
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  pass('1. WS then older poll → [1, 2]');
}

{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [
      itemFromIncoming(ban('2', '2026-01-01T11:00:00.000Z')),
      itemFromIncoming(ban('1', '2026-01-01T10:00:00.000Z')),
    ],
    userId: USER,
    source: 'bootstrap',
  });
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:1',
    'incoming:2',
  ]);
  pass('2. Bootstrap newest-first payload → canonical [1,2]');
}

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
  assert.equal(store.getState().activeItemId, 'incoming:1');
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('0', '2026-01-01T09:00:00.000Z')),
    source: 'websocket',
    userId: USER,
  });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  assert.deepEqual(store.getState().passiveItemIds, [
    'incoming:0',
    'incoming:2',
  ]);
  pass('3. Activate 1; ingest older → active stays; passive sorted');
}

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
  store.dispatch({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, null);
  store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
  assert.equal(store.getState().activeItemId, 'incoming:1');
  pass('4. Close then reopen activates same FIFO head; no auto-drain');
}

console.log(`\n${passed} passed\n`);
