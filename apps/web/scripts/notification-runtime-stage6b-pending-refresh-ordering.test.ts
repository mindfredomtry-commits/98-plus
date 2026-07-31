/**
 * Stage 6B Phase 5 — pending refresh generation ordering.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6b-pending-refresh-ordering.test.ts
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
  decidePendingSnapshotApply,
  isStalePendingRefreshGeneration,
} from '../src/notification-runtime/notification-runtime.pending-refresh-ordering';
import {
  ingestPendingSnapshot,
  markRuntimeItemConsumed,
  mergePendingItemIds,
  nextPendingAuthorityGeneration,
} from '../src/notification-runtime/notification-runtime.pending';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import {
  selectIndicatorVisible,
  selectPendingCount,
  selectPendingItemIds,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationItem,
} from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}
function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}

function sinks() {
  return {
    writeQueue: () => {},
    writeDisplay: () => {},
  };
}

function seed(items: NotificationItem[]) {
  const store = createNotificationRuntimeStore();
  syncRuntimeQueue(store, items, 'test', nextRuntimeTransitionId('p5-seed'));
  return store;
}

const webSrc = join(process.cwd(), 'apps/web/src');
const transportSrc = readFileSync(
  join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
  'utf8',
);
const pendingSrc = readFileSync(
  join(webSrc, 'notification-runtime/notification-runtime.pending.ts'),
  'utf8',
);
const orderingSrc = readFileSync(
  join(
    webSrc,
    'notification-runtime/notification-runtime.pending-refresh-ordering.ts',
  ),
  'utf8',
);
const reducerSrc = readFileSync(
  join(webSrc, 'notification-runtime/notification-runtime.reducer.ts'),
  'utf8',
);

async function main() {
  // 1. Slow old empty fetch after fast new non-empty fetch
  {
    const store = createNotificationRuntimeStore();
    const gOld = nextPendingAuthorityGeneration();
    const gNew = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A', 'check:B'], 'prefetch', 'new', gNew);
    ingestPendingSnapshot(store, [], 'prefetch', 'old-empty', gOld);
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:A',
      'check:B',
    ]);
    assert.equal(store.getState().pending.generation, gNew);
    pass('1. slow empty after fast non-empty');
  }

  // 2. Slow old non-empty fetch after fast new empty fetch
  {
    const store = createNotificationRuntimeStore();
    const gOld = nextPendingAuthorityGeneration();
    const gNew = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, [], 'prefetch', 'new-empty', gNew);
    ingestPendingSnapshot(store, ['incoming:STALE'], 'prefetch', 'old', gOld);
    assert.deepEqual(selectPendingItemIds(store.getState()), []);
    assert.equal(store.getState().pending.generation, gNew);
    pass('2. slow non-empty after fast empty');
  }

  // 3. Fetch A starts, WebSocket enqueues item B, fetch A completes
  {
    const store = createNotificationRuntimeStore();
    const gA = nextPendingAuthorityGeneration();
    // Live WS merge stamps a newer generation than in-flight fetch A.
    mergePendingItemIds(store, ['incoming:B'], 'websocket');
    assert.ok(selectPendingItemIds(store.getState()).includes('incoming:B'));
    assert.ok(store.getState().pending.generation > gA);
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'fetch-a', gA);
    assert.ok(
      selectPendingItemIds(store.getState()).includes('incoming:B'),
      'B must survive stale fetch A',
    );
    assert.equal(
      isStalePendingRefreshGeneration(store.getState().pending.generation, gA),
      true,
    );
    pass('3. WS item survives stale fetch completion');
  }

  // 4. Fetch contains item consumed while request in flight
  {
    const store = createNotificationRuntimeStore();
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'start', g);
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'late', g);
    assert.equal(selectIndicatorVisible(store.getState()), false);
    assert.ok(store.getState().consumed.itemIds.includes('incoming:A'));
    assert.deepEqual(selectPendingItemIds(store.getState()), []);
    pass('4. consumed in-flight not restored');
  }

  // 5. Two concurrent reconnect refreshes — only latest eligible applies
  {
    const store = createNotificationRuntimeStore();
    const g1 = nextPendingAuthorityGeneration();
    const g2 = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:LATEST'], 'bootstrap', 'g2', g2);
    ingestPendingSnapshot(store, ['incoming:OLD'], 'bootstrap', 'g1', g1);
    assert.deepEqual(selectPendingItemIds(store.getState()), ['incoming:LATEST']);
    assert.equal(store.getState().pending.generation, g2);
    pass('5. concurrent reconnect — latest wins');
  }

  // 6. Startup fetch races reconnect fetch — generation winner
  {
    const store = createNotificationRuntimeStore();
    const startupGen = nextPendingAuthorityGeneration();
    const reconnectGen = nextPendingAuthorityGeneration();
    assert.ok(reconnectGen > startupGen);
    ingestPendingSnapshot(
      store,
      ['incoming:STARTUP'],
      'bootstrap',
      'startup',
      startupGen,
    );
    ingestPendingSnapshot(
      store,
      ['incoming:RECONNECT'],
      'recovery',
      'reconnect',
      reconnectGen,
    );
    // Late startup completion
    ingestPendingSnapshot(
      store,
      ['incoming:STARTUP'],
      'bootstrap',
      'startup-late',
      startupGen,
    );
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:RECONNECT',
    ]);
    assert.equal(store.getState().pending.generation, reconnectGen);
    pass('6. startup vs reconnect generation winner');
  }

  // 7. Action-success refresh races WebSocket completion
  {
    const store = seed([check('C'), incoming('D')]);
    const gRefresh = nextPendingAuthorityGeneration();
    completeRuntimeItem(store, 'check:C', 'user');
    markRuntimeItemConsumed(store, 'check:C', 'user');
    mergePendingItemIds(store, ['incoming:D'], 'websocket');
    const gWs = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(
      store,
      ['incoming:D'],
      'websocket',
      'ws-after-complete',
      gWs,
    );
    // Stale action-success refresh still lists completed check
    ingestPendingSnapshot(
      store,
      ['check:C', 'incoming:D'],
      'success-exit',
      'action-refresh',
      gRefresh,
    );
    assert.ok(!selectPendingItemIds(store.getState()).includes('check:C'));
    assert.ok(store.getState().consumed.itemIds.includes('check:C'));
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:D');
    pass('7. action-success refresh cannot resurrect completed');
  }

  // 8. Duplicate completion for same generation — idempotent
  {
    const store = createNotificationRuntimeStore();
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'v1', g);
    const snap = store.getState();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'v1', g);
    assert.deepEqual(selectPendingItemIds(store.getState()), ['incoming:A']);
    assert.equal(store.getState().pending.generation, g);
    assert.equal(store.getState().pending.sourceVersion, snap.pending.sourceVersion);
    pass('8. duplicate same-generation idempotent');
  }

  // 9. Unknown / invalid generation — safely ignored
  {
    const store = createNotificationRuntimeStore();
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'good', g);
    ingestPendingSnapshot(store, ['incoming:BAD'], 'prefetch', 'nan', Number.NaN);
    ingestPendingSnapshot(store, ['incoming:BAD2'], 'prefetch', 'neg', -1);
    assert.deepEqual(selectPendingItemIds(store.getState()), ['incoming:A']);
    assert.equal(
      decidePendingSnapshotApply({
        currentGeneration: 3,
        currentItemIds: ['incoming:A'],
        currentSourceVersion: 'v',
        incomingIds: ['incoming:X'],
        incomingSourceVersion: 'bad',
        stamped: Number.NaN,
        holdsLocalItem: false,
      }).action,
      'reject',
    );
    pass('9. unknown generation rejected');
  }

  // 10. Generation monotonicity across bootstrap and ordinary refresh
  {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    const bootGen = nextPendingAuthorityGeneration();
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId,
        items: [incoming('BOOT')],
        pendingItemIds: ['incoming:BOOT'],
        consumedItemIds: [],
        sourceVersion: 'boot',
        source: 'bootstrap',
        generation: bootGen,
      },
    );
    assert.equal(store.getState().pending.generation, bootGen);
    const refreshGen = nextPendingAuthorityGeneration();
    assert.ok(refreshGen > bootGen);
    ingestPendingSnapshot(
      store,
      ['incoming:BOOT', 'check:NEXT'],
      'prefetch',
      'refresh',
      refreshGen,
    );
    assert.equal(store.getState().pending.generation, refreshGen);
    ingestPendingSnapshot(
      store,
      ['incoming:OLD'],
      'bootstrap',
      'stale-boot',
      bootGen,
    );
    assert.equal(store.getState().pending.generation, refreshGen);
    assert.ok(selectPendingItemIds(store.getState()).includes('check:NEXT'));
    pass('10. generation monotonic across bootstrap+refresh');
  }

  // 11. Stale fetch cannot clear ready queue head
  {
    const store = seed([incoming('A'), check('B')]);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:A');
    assert.equal(store.getState().lifecycle.status, 'idle');
    const gOld = nextPendingAuthorityGeneration();
    const gNew = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A', 'check:B'], 'prefetch', 'n', gNew);
    ingestPendingSnapshot(store, [], 'prefetch', 'old', gOld);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:A');
    assert.equal(store.getState().items.queue.length, 2);
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:A',
      'check:B',
    ]);
    pass('11. stale fetch cannot clear ready queue head');
  }

  // 12. Stale fetch cannot reorder canonical runtime queue
  {
    const store = seed([incoming('A'), check('B')]);
    const before = store.getState().items.queue.map(notificationItemId);
    const gOld = nextPendingAuthorityGeneration();
    const gNew = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['check:B', 'incoming:A'], 'prefetch', 'n', gNew);
    ingestPendingSnapshot(store, ['incoming:Z'], 'prefetch', 'old', gOld);
    assert.deepEqual(
      store.getState().items.queue.map(notificationItemId),
      before,
    );
    pass('12. stale fetch cannot reorder runtime queue');
  }

  // 13. Latest fetch may ingest genuinely new identities exactly once
  {
    const store = createNotificationRuntimeStore();
    const g1 = nextPendingAuthorityGeneration();
    const g2 = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', '1', g1);
    ingestPendingSnapshot(store, ['incoming:A', 'check:B'], 'prefetch', '2', g2);
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:A',
      'check:B',
    ]);
    ingestPendingSnapshot(store, ['incoming:A', 'check:B'], 'prefetch', '2', g2);
    assert.equal(selectPendingCount(store.getState()), 2);
    pass('13. latest ingest new identities once');
  }

  // 14. Indicator reflects latest pending minus consumed
  {
    const store = createNotificationRuntimeStore();
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(
      store,
      ['incoming:A', 'check:B', 'result:C'],
      'prefetch',
      'v',
      g,
    );
    markRuntimeItemConsumed(store, 'check:B', 'user');
    assert.equal(selectPendingCount(store.getState()), 2);
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:A',
      'result:C',
    ]);
    pass('14. indicator = latest pending − consumed');
  }

  // 15. Stale pending result cannot re-enable indicator after final consumption
  {
    const store = createNotificationRuntimeStore();
    const gOld = nextPendingAuthorityGeneration();
    const gNew = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'old-era', gOld);
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    ingestPendingSnapshot(store, [], 'prefetch', 'cleared', gNew);
    assert.equal(selectIndicatorVisible(store.getState()), false);
    ingestPendingSnapshot(store, ['incoming:A'], 'prefetch', 'stale', gOld);
    assert.equal(selectIndicatorVisible(store.getState()), false);
    pass('15. stale cannot re-enable indicator after consume');
  }

  // 16. Refresh after browser remount applies once
  {
    const store = createNotificationRuntimeStore();
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(store, ['incoming:A'], 'bootstrap', 'remount', g);
    ingestPendingSnapshot(store, ['incoming:A'], 'bootstrap', 'remount', g);
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.equal(store.getState().pending.generation, g);
    pass('16. remount refresh applies once');
  }

  // 17. Runtime queue already containing two cards remains ordered after refresh
  {
    const store = seed([incoming('A'), check('B')]);
    const g = nextPendingAuthorityGeneration();
    ingestPendingSnapshot(
      store,
      ['incoming:A', 'check:B', 'result:C'],
      'prefetch',
      'refresh',
      g,
    );
    assert.deepEqual(store.getState().items.queue.map(notificationItemId), [
      'incoming:A',
      'check:B',
    ]);
    pass('17. two-card queue order preserved after refresh');
  }

  // 18. Source scan — refresh completion cannot use frozen overlayQueueRef replace
  {
    assert.match(orderingSrc, /decidePendingSnapshotApply/);
    assert.match(orderingSrc, /stale-generation/);
    assert.match(reducerSrc, /decidePendingSnapshotApply/);
    assert.match(pendingSrc, /nextPendingAuthorityGeneration/);
    assert.match(pendingSrc, /generation \?\? nextPendingAuthorityGeneration/);
    // Active transport stamps generation and calls ingestPendingSnapshot — not
    // syncRuntimeQueue(overlayQueueRef) on the pending-authority path.
    assert.match(transportSrc, /ingestPendingSnapshot\(/);
    assert.match(transportSrc, /nextPendingAuthorityGeneration\(\)/);
    assert.doesNotMatch(transportSrc, /syncRuntimeQueue\(/);
    assert.doesNotMatch(transportSrc, /overlayQueueRef/);
    assert.doesNotMatch(transportSrc, /from ['"]@\/components\/Providers['"]/);
    assert.equal(isStalePendingRefreshGeneration(5, 3), true);
    assert.equal(isStalePendingRefreshGeneration(5, 5), false);
    assert.equal(isStalePendingRefreshGeneration(5, null), false);
    pass('18. source scan — no frozen overlayQueueRef replace on refresh');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
