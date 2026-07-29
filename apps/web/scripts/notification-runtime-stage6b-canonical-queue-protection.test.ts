/**
 * Stage 6B Phase 1 — canonical queue protection.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6b-canonical-queue-protection.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import {
  selectCurrentItemId,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}

function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}

function ids(state: NotificationRuntimeState): string[] {
  return state.items.queue.map(notificationItemId);
}

function seed(items: NotificationItem[]) {
  const store = createNotificationRuntimeStore();
  syncRuntimeQueue(store, items, 'test', nextRuntimeTransitionId('phase1-seed'));
  return store;
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

// 1. Two queued cards advance atomically without a lobby claim.
{
  const store = seed([check('A'), incoming('B')]);
  const observed: NotificationRuntimeState[] = [];
  store.subscribe(() => observed.push(store.getState()));

  completeRuntimeItem(store, 'check:A', 'websocket');

  assert.deepEqual(ids(store.getState()), ['incoming:B']);
  assert.equal(selectCurrentItemId(store.getState()), 'incoming:B');
  assert.equal(store.getState().display.kind, 'incoming');
  assert.equal(selectLobbyMayShow(store.getState()), false);
  assert.ok(observed.length > 0);
  assert.equal(observed.some(selectLobbyMayShow), false);
  pass('two cards: completing first activates second with no lobby state');
}

// 2. Removing an exact middle identity preserves all unrelated FIFO order.
{
  const store = seed([incoming('A'), check('B'), incoming('C')]);
  completeRuntimeItem(store, 'check:B', 'websocket');
  assert.deepEqual(ids(store.getState()), ['incoming:A', 'incoming:C']);
  assert.equal(selectCurrentItemId(store.getState()), 'incoming:A');
  assert.equal(selectLobbyMayShow(store.getState()), false);
  pass('three cards: exact middle completion preserves remaining order');
}

// 3. A frozen-empty compatibility ref is not an input to completion.
{
  const store = seed([check('A'), incoming('B'), incoming('C')]);
  const frozenOverlayQueueRef: readonly NotificationItem[] = Object.freeze([]);
  assert.equal(frozenOverlayQueueRef.length, 0);
  completeRuntimeItem(store, 'check:A', 'websocket');
  assert.deepEqual(ids(store.getState()), ['incoming:B', 'incoming:C']);
  pass('empty compatibility ref cannot clear the runtime queue');
}

// 4. A stale host snapshot cannot remove a newer runtime item.
{
  const store = seed([check('A'), incoming('B')]);
  const staleHostSnapshot = [check('A')];
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: nextRuntimeTransitionId('phase1-newer-item'),
    items: [incoming('C')],
    source: 'websocket',
  });
  assert.deepEqual(ids(store.getState()), [
    'check:A',
    'incoming:B',
    'incoming:C',
  ]);
  assert.deepEqual(staleHostSnapshot.map(notificationItemId), ['check:A']);

  completeRuntimeItem(store, 'check:A', 'websocket');
  assert.deepEqual(ids(store.getState()), ['incoming:B', 'incoming:C']);
  pass('stale host snapshot cannot replace newer canonical items');
}

// 5. Duplicate completion is idempotent and cannot consume the next card.
{
  const store = seed([check('A'), incoming('B')]);
  completeRuntimeItem(store, 'check:A', 'websocket');
  const afterFirst = store.getState();
  const second = completeRuntimeItem(store, 'check:A', 'websocket');
  assert.equal(second.state, afterFirst);
  assert.deepEqual(ids(store.getState()), ['incoming:B']);
  assert.equal(selectLobbyMayShow(store.getState()), false);
  pass('duplicate completion is idempotent');
}

// 6. Unknown and already-consumed identities are no-ops.
{
  const store = seed([check('A'), incoming('B')]);
  const beforeUnknown = store.getState();
  const unknown = completeRuntimeItem(store, 'check:missing', 'websocket');
  assert.equal(unknown.state, beforeUnknown);
  assert.deepEqual(ids(store.getState()), ['check:A', 'incoming:B']);

  completeRuntimeItem(store, 'check:A', 'websocket');
  const beforeDuplicate = store.getState();
  const consumed = completeRuntimeItem(store, 'check:A', 'websocket');
  assert.equal(consumed.state, beforeDuplicate);
  assert.deepEqual(ids(store.getState()), ['incoming:B']);
  pass('unknown or consumed completion leaves canonical queue unchanged');
}

// 7. Final completion reaches canonical idle+empty before lobby eligibility.
{
  const store = seed([check('A')]);
  assert.equal(selectLobbyMayShow(store.getState()), false);
  completeRuntimeItem(store, 'check:A', 'websocket');
  const state = store.getState();
  assert.deepEqual(ids(state), []);
  assert.equal(state.display.kind, null);
  assert.equal(state.display.payload, null);
  assert.equal(state.lifecycle.status, 'idle');
  assert.equal(selectOverlayVisible(state), false);
  assert.equal(selectLobbyMayShow(state), true);
  pass('final completion permits lobby only at runtime idle+empty');
}

// 8. WS completion reports identities; it cannot send a replacement queue.
{
  const providers = readFileSync(
    join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
    'utf8',
  );
  const start = providers.indexOf("case 'check:completed':");
  const end = providers.indexOf("case 'sync:session':", start);
  assert.ok(start >= 0 && end > start, 'check:completed handler exists');
  const handler = providers.slice(start, end);
  assert.match(handler, /completeRuntimeItem/);
  assert.doesNotMatch(handler, /applyOverlayQueue/);
  assert.doesNotMatch(handler, /overlayQueueRef\.current/);
  assert.doesNotMatch(handler, /syncRuntimeQueue/);

  const advance = readFileSync(
    join(
      process.cwd(),
      'apps/web/src/notification-runtime/notification-runtime.production-advance.ts',
    ),
    'utf8',
  );
  const dismissStart = advance.indexOf('export function dismissProductionHeadAtomic');
  const dismissEnd = advance.indexOf('export function runtimeHeadItemId', dismissStart);
  const dismissBody = advance.slice(dismissStart, dismissEnd);
  assert.doesNotMatch(dismissBody, /queueBefore/);
  assert.doesNotMatch(dismissBody, /syncRuntimeQueue/);
  pass('host completion and atomic dismiss cannot replace runtime queue');
}

console.log(`\n${passed} passed\n`);
