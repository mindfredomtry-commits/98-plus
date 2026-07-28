/**
 * Stage 6A — runtime-prev enqueue/dismiss alignment.
 *
 * Ensures enqueue/dismiss build from runtime queue (not empty overlayQueueRef),
 * so [A] + enqueue B → [A,B] and dismiss never invents a Lobby gap.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6a-runtime-prev.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  enqueueWithActiveLock,
  getActiveOverlayKey,
  popOverlayHead,
} from '../src/lib/overlay-queue';
import { projectRuntimeQueueToLegacy } from '../src/notification-runtime/notification-runtime.adapters';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  dismissProductionHeadAtomic,
} from '../src/notification-runtime/notification-runtime.production-advance';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
  toRuntimeItems,
} from '../src/notification-runtime/notification-runtime.store';
import {
  getLastStaleReplaceRejection,
  resetStaleReplaceGuardForTests,
} from '../src/notification-runtime/notification-runtime.stale-replace-guard';

const root = join(__dirname, '..');
const providersPath = join(root, 'src/components/Providers.tsx');

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

function ids(queue: QueuedOverlay[]): string[] {
  return queue.map((q) =>
    q.kind === 'result' ? `result:${q.result.id}` : `${q.kind}:${q.ban.id}`,
  );
}

/** Mirror Stage 6A enqueueNotification prev path. */
function enqueueViaRuntimePrev(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  item: QueuedOverlay,
): QueuedOverlay[] {
  const prev = projectRuntimeQueueToLegacy(store.getState());
  const { queue: next, changed } = enqueueWithActiveLock(prev, item, {
    source: 'stage6a-test',
  });
  if (!changed) return prev;
  syncRuntimeQueue(
    store,
    toRuntimeItems(next),
    'websocket',
    nextRuntimeTransitionId('stage6a-enqueue'),
  );
  return projectRuntimeQueueToLegacy(store.getState());
}

function showHead(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  queue: QueuedOverlay[],
) {
  syncRuntimeQueue(
    store,
    toRuntimeItems(queue),
    'system',
    nextRuntimeTransitionId('stage6a-show'),
  );
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== STAGE 6A — RUNTIME-PREV ENQUEUE/DISMISS ===\n');

const providersSrc = readFileSync(providersPath, 'utf8');

// Source wiring
{
  assert.match(providersSrc, /readRuntimePrevQueue/);
  assert.match(
    providersSrc,
    /Stage 6A: prev from runtime authority|Stage 6A: previous queue from runtime/,
  );
  const enqueueIdx = providersSrc.indexOf('const enqueueNotification');
  const enqueueBody = providersSrc.slice(
    enqueueIdx,
    providersSrc.indexOf('[applyOverlayQueue, applyPendingQueueViaOwner, isOverlayLive', enqueueIdx),
  );
  assert.match(enqueueBody, /readRuntimePrevQueue\(\)/);
  assert.doesNotMatch(enqueueBody, /const prev = overlayQueueRef\.current/);

  const dismissIdx = providersSrc.indexOf('const dismissCurrentOverlay');
  const dismissBody = providersSrc.slice(
    dismissIdx,
    providersSrc.indexOf('[applyOverlayQueue, applyPendingQueueViaOwner, commitSyncDisplayActivePayload', dismissIdx),
  );
  assert.match(dismissBody, /readRuntimePrevQueue\(\)/);
  assert.doesNotMatch(
    dismissBody,
    /owner\.queue\.length > 0 \? owner\.queue : overlayQueueRef\.current/,
  );
  pass('Providers enqueue/dismiss use readRuntimePrevQueue');
}

// 1. A visible → enqueue B → [A,B]
{
  const store = createNotificationRuntimeStore();
  showHead(store, [incoming('A')]);
  assert.equal(store.getState().lifecycle.status, 'showing');
  const next = enqueueViaRuntimePrev(store, incoming('B'));
  assert.deepEqual(ids(next), ['incoming:A', 'incoming:B']);
  assert.equal(getActiveOverlayKey(next), 'incoming:A');
  assert.equal(store.getState().display.kind, 'incoming');
  pass('Incoming A visible; enqueue B → runtime queue [A, B]');
}

// 2. enqueue C → [A,B,C]
{
  const store = createNotificationRuntimeStore();
  showHead(store, [incoming('A')]);
  enqueueViaRuntimePrev(store, incoming('B'));
  const next = enqueueViaRuntimePrev(store, incoming('C'));
  assert.deepEqual(ids(next), ['incoming:A', 'incoming:B', 'incoming:C']);
  pass('Enqueue B then C → runtime queue [A, B, C]');
}

// 3–4. Dismiss A → B; dismiss B → C; no lobby gap while hasNext
{
  const store = createNotificationRuntimeStore();
  showHead(store, [incoming('A'), incoming('B'), incoming('C')]);
  const prev1 = projectRuntimeQueueToLegacy(store.getState());
  const atomic1 = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: prev1,
      targetItemId: 'incoming:A',
      reason: 'user_dismiss',
      source: 'stage6a-dismiss-A',
      transitionId: nextRuntimeTransitionId('stage6a-dismiss-A'),
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  assert.equal(atomic1.hasNext, true);
  assert.deepEqual(ids(projectRuntimeQueueToLegacy(store.getState())), [
    'incoming:B',
    'incoming:C',
  ]);
  assert.equal(store.getState().display.kind, 'incoming');
  assert.equal(
    (store.getState().display.payload as { ban: BanInteraction }).ban.id,
    'B',
  );
  assert.notEqual(store.getState().lifecycle.status, 'idle');
  pass('Dismiss A → B immediately visible; no Lobby (hasNext)');

  const prev2 = projectRuntimeQueueToLegacy(store.getState());
  const atomic2 = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: prev2,
      targetItemId: 'incoming:B',
      reason: 'user_dismiss',
      source: 'stage6a-dismiss-B',
      transitionId: nextRuntimeTransitionId('stage6a-dismiss-B'),
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  assert.equal(atomic2.hasNext, true);
  assert.deepEqual(ids(projectRuntimeQueueToLegacy(store.getState())), [
    'incoming:C',
  ]);
  assert.equal(
    (store.getState().display.payload as { ban: BanInteraction }).ban.id,
    'C',
  );
  pass('Dismiss B → C immediately visible');
}

// 5. Legacy overlayQueueRef empty; runtime populated; enqueue preserves
{
  const store = createNotificationRuntimeStore();
  showHead(store, [incoming('A'), incoming('B')]);
  const legacyEmpty: QueuedOverlay[] = [];
  // Bug path (pre-6A): enqueue from empty legacy collapses to [C].
  const buggy = enqueueWithActiveLock(legacyEmpty, incoming('C')).queue;
  assert.deepEqual(ids(buggy), ['incoming:C']);

  // Fixed path: runtime prev preserves [A,B,C].
  const fixed = enqueueViaRuntimePrev(store, incoming('C'));
  assert.deepEqual(ids(fixed), ['incoming:A', 'incoming:B', 'incoming:C']);
  pass('Legacy ref empty; runtime populated; enqueue still preserves queue');
}

// 6. Stale empty replace cannot collapse runtime queue
{
  resetStaleReplaceGuardForTests();
  const store = createNotificationRuntimeStore();
  showHead(store, [incoming('A'), incoming('B')]);
  assert.equal(store.getState().lifecycle.status, 'showing');
  syncRuntimeQueue(
    store,
    toRuntimeItems([]),
    'poll',
    nextRuntimeTransitionId('stage6a-stale-empty'),
  );
  const after = store.getState();
  assert.deepEqual(ids(projectRuntimeQueueToLegacy(after)), [
    'incoming:A',
    'incoming:B',
  ]);
  const rejection = getLastStaleReplaceRejection();
  assert.ok(rejection);
  assert.equal(rejection?.outcome, 'STALE_REPLACE_REJECTED_ACTIVE_DISPLAY');
  assert.equal(rejection?.reason, 'empty-replace-while-showing-renderable');
  pass('Stale empty replacement cannot collapse runtime queue');
}

// popOverlayHead preserve for dismiss remaining (no Lobby invent)
{
  const q = [incoming('A'), incoming('B')];
  const remaining = popOverlayHead(q);
  assert.deepEqual(ids(remaining), ['incoming:B']);
  pass('popOverlayHead leaves next head without inventing empty Lobby frame');
}

console.log(`\n${passed} passed\n`);
