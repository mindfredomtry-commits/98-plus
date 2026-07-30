/**
 * Stage 6B Phase 4 — runtime recovery and reconnect determinism.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6b-reconnect-recovery.test.ts
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
  decideReconnectRecoveryRequest,
  decideWsReconnectSignal,
  isDuplicateQueuedIdentity,
  isRecoveryTransitionCurrent,
  isStalePendingGeneration,
  nextAppliedPendingGeneration,
} from '../src/notification-runtime/notification-runtime.reconnect-recovery';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import {
  nextPendingAuthorityGeneration,
} from '../src/notification-runtime/notification-runtime.pending';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
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
  syncRuntimeQueue(store, items, 'test', nextRuntimeTransitionId('p4-seed'));
  return store;
}

const webSrc = join(process.cwd(), 'apps/web/src');
const wsSrc = readFileSync(join(webSrc, 'hooks/useWebSocket.ts'), 'utf8');
const providersSrc = readFileSync(
  join(webSrc, 'components/Providers.tsx'),
  'utf8',
);
const reconnectSrc = readFileSync(
  join(webSrc, 'notification-runtime/notification-runtime.reconnect-recovery.ts'),
  'utf8',
);

async function main() {
  // 1. Single reconnect signal
  {
    assert.deepEqual(
      decideWsReconnectSignal({ source: 'socket-open', hasOpenedOnce: true }),
      { emit: true, reason: 'reconnect-open' },
    );
    pass('1. single reconnect');
  }

  // 2. Repeated reconnect — each open after first emits; close never emits
  {
    const signals = [
      decideWsReconnectSignal({ source: 'socket-open', hasOpenedOnce: false }),
      decideWsReconnectSignal({ source: 'socket-close-timeout', hasOpenedOnce: true }),
      decideWsReconnectSignal({ source: 'socket-open', hasOpenedOnce: true }),
      decideWsReconnectSignal({ source: 'socket-close-timeout', hasOpenedOnce: true }),
      decideWsReconnectSignal({ source: 'socket-open', hasOpenedOnce: true }),
    ];
    assert.equal(signals.filter((s) => s.emit).length, 2);
    assert.equal(signals[0]!.emit, false);
    assert.equal(signals[1]!.emit, false);
    pass('2. repeated reconnect');
  }

  // 3. Duplicate websocket completion (ITEM_COMPLETED idempotent)
  {
    const store = seed([check('C'), incoming('D')]);
    completeRuntimeItem(store, 'check:C', 'websocket');
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:D');
    completeRuntimeItem(store, 'check:C', 'websocket');
    assert.equal(store.getState().items.queue.length, 1);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:D');
    pass('3. duplicate websocket completion');
  }

  // 4. Duplicate websocket enqueue (dedupe identity)
  {
    const store = seed([incoming('A')]);
    syncRuntimeQueue(
      store,
      [incoming('A'), incoming('B')],
      'websocket',
      nextRuntimeTransitionId('p4-dup-enq'),
    );
    const ids = store.getState().items.queue.map(notificationItemId);
    assert.equal(isDuplicateQueuedIdentity(ids, 'incoming:A'), true);
    assert.deepEqual(
      [...new Set(ids)].sort(),
      [...ids].sort().filter((id, i, arr) => arr.indexOf(id) === i).sort(),
    );
    // Queue must not contain two incoming:A
    assert.equal(ids.filter((id) => id === 'incoming:A').length, 1);
    pass('4. duplicate websocket enqueue');
  }

  // 5. Out-of-order fetch responses (stale transition ignored)
  {
    const store = createNotificationRuntimeStore();
    const a = requestBootstrap(store, { transitionId: 'boot-old' });
    const b = requestBootstrap(store, { transitionId: 'boot-new' });
    assert.equal(a.accepted, true);
    assert.equal(b.accepted, true);
    const stale = completeBootstrap(store, {
      transitionId: a.transitionId,
      items: [incoming('OLD')],
      pendingItemIds: ['incoming:OLD'],
      mode: 'real-time',
      generation: 1,
    });
    assert.equal(stale, 'stale');
    const fresh = completeBootstrap(
      store,
      {
        transitionId: b.transitionId,
        items: [incoming('NEW')],
        pendingItemIds: ['incoming:NEW'],
        mode: 'real-time',
        generation: 2,
      },
      sinks(),
    );
    assert.equal(fresh, 'showing');
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:NEW');
    pass('5. out-of-order fetch responses');
  }

  // 6. Slow fetch after fast fetch (generation monotonic)
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store, { transitionId: 'gen-boot' });
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('FAST')],
        pendingItemIds: ['incoming:FAST'],
        mode: 'real-time',
        generation: 5,
      },
      sinks(),
    );
    assert.equal(store.getState().pending.generation, 5);
    // Older stamped apply rejected by generation helper:
    assert.equal(isStalePendingGeneration(5, 3), true);
    assert.equal(nextAppliedPendingGeneration(5, 3), 5);
    assert.equal(nextAppliedPendingGeneration(5, 7), 7);
    // Applying older generation via PENDING would be dropped by resolvePendingReplacement;
    // bootstrap already completed — start new boot and prove older stamp cannot go back.
    const req2 = requestBootstrap(store, { transitionId: 'gen-boot-2' });
    completeBootstrap(
      store,
      {
        transitionId: req2.transitionId,
        items: [incoming('SLOW')],
        pendingItemIds: ['incoming:SLOW'],
        mode: 'real-time',
        generation: 3,
      },
      sinks(),
    );
    assert.equal(store.getState().pending.generation >= 5, true);
    pass('6. slow fetch after fast fetch');
  }

  // 7. Recovery while queue already populated → skip wipe (overlay visible)
  {
    const store = seed([incoming('A'), incoming('B')]);
    const decision = decideReconnectRecoveryRequest(store.getState());
    assert.equal(decision.action, 'skip');
    if (decision.action === 'skip') {
      assert.equal(decision.reason, 'overlay-visible');
    }
    assert.equal(store.getState().items.queue.length, 2);
    pass('7. recovery while queue already populated');
  }

  // 8. Recovery while active display exists → skip
  {
    const store = seed([incoming('X')]);
    assert.equal(selectOverlayVisible(store.getState()), true);
    const decision = decideReconnectRecoveryRequest(store.getState());
    assert.equal(decision.action, 'skip');
    pass('8. recovery while active display exists');
  }

  // 9. Browser refresh recovery (cold bootstrap → deterministic idle/show)
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store, { transitionId: 'refresh' });
    assert.equal(store.getState().lifecycle.status, 'booting');
    const out = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('R1'), check('R2')],
        pendingItemIds: ['incoming:R1', 'check:R2'],
        mode: 'real-time',
        generation: nextPendingAuthorityGeneration(),
      },
      sinks(),
    );
    assert.equal(out, 'showing');
    assert.equal(store.getState().items.queue.length, 2);
    assert.equal(isRecoveryTransitionCurrent(store.getState(), req.transitionId), false);
    pass('9. browser refresh recovery');
  }

  // 10. Recovery interrupted by second reconnect (supersede)
  {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { transitionId: 'first' });
    const coalesce = decideReconnectRecoveryRequest(store.getState());
    assert.equal(coalesce.action, 'coalesce');
    const supersede = decideReconnectRecoveryRequest(store.getState(), {
      forceSupersede: true,
    });
    assert.equal(supersede.action, 'supersede');
    const second = requestBootstrap(store, { transitionId: 'second' });
    assert.equal(second.accepted, true);
    assert.equal(store.getState().recovery.transitionId, 'second');
    assert.equal(
      completeBootstrap(store, {
        transitionId: 'first',
        items: [incoming('LOST')],
        pendingItemIds: ['incoming:LOST'],
        mode: 'real-time',
      }),
      'stale',
    );
    completeBootstrap(
      store,
      {
        transitionId: 'second',
        items: [incoming('WIN')],
        pendingItemIds: ['incoming:WIN'],
        mode: 'real-time',
        generation: 1,
      },
      sinks(),
    );
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:WIN');
    pass('10. recovery interrupted by second reconnect');
  }

  // 11. Generation monotonicity
  {
    let gen = 0;
    gen = nextAppliedPendingGeneration(gen, 1);
    gen = nextAppliedPendingGeneration(gen, 4);
    gen = nextAppliedPendingGeneration(gen, 2);
    assert.equal(gen, 4);
    assert.equal(isStalePendingGeneration(4, 2), true);
    assert.equal(isStalePendingGeneration(4, 4), false);
    pass('11. generation monotonicity');
  }

  // 12. Duplicate recovery completion (same transition applied once)
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store, { transitionId: 'once' });
    const first = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [],
        pendingItemIds: [],
        mode: 'normal',
        generation: 1,
      },
      sinks(),
    );
    assert.equal(first, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    // Re-complete same tid after recovery.transitionId cleared → not current
    const dup = completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('DUP')],
      pendingItemIds: ['incoming:DUP'],
      mode: 'real-time',
      generation: 2,
    });
    assert.equal(dup, 'stale');
    assert.equal(store.getState().items.queue.length, 0);
    pass('12. duplicate recovery completion');
  }

  // 13. Runtime survives reconnect with two queued cards (skip while showing)
  {
    const store = seed([incoming('T1'), incoming('T2')]);
    const before = store.getState().items.queue.map(notificationItemId);
    const decision = decideReconnectRecoveryRequest(store.getState());
    assert.equal(decision.action, 'skip');
    assert.deepEqual(
      store.getState().items.queue.map(notificationItemId),
      before,
    );
    pass('13. runtime survives reconnect with two queued cards');
  }

  // 14. Reconnect after final item consumed
  {
    const store = seed([incoming('Z')]);
    completeRuntimeItem(store, 'incoming:Z', 'websocket');
    assert.equal(isRuntimeIdleEmpty(store.getState()), true);
    const decision = decideReconnectRecoveryRequest(store.getState());
    assert.equal(decision.action, 'bootstrap');
    const req = requestBootstrap(store, { transitionId: 'after-final' });
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [],
        pendingItemIds: [],
        mode: 'normal',
        generation: 1,
      },
      sinks(),
    );
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectPendingCount(store.getState()), 0);
    pass('14. reconnect after final item consumed');
  }

  // 15. Recovery idempotency source scan
  {
    assert.match(wsSrc, /decideWsReconnectSignal/);
    assert.match(wsSrc, /hasOpenedOnceRef/);
    assert.doesNotMatch(
      wsSrc,
      /setTimeout\(\s*\(\)\s*=>\s*\{[^}]*onReconnectRef\.current/,
    );
    assert.match(providersSrc, /decideReconnectRecoveryRequest/);
    assert.match(providersSrc, /bootstrapPendingGeneration/);
    assert.match(providersSrc, /generation: bootstrapPendingGeneration/);
    assert.match(reconnectSrc, /Stage 6B Phase 4/);
    assert.doesNotMatch(reconnectSrc, /setTimeout/);
    pass('15. recovery idempotency source scan');
  }

  console.log(
    `notification-runtime-stage6b-reconnect-recovery.test.ts: ${passed} passed`,
  );
}

/** Local alias — idle+empty check without importing overboard module name. */
function isRuntimeIdleEmpty(state: {
  lifecycle: { status: string };
  display: { kind: string | null; payload: unknown };
  items: { queue: unknown[] };
  action: { status: string };
}): boolean {
  return (
    state.lifecycle.status === 'idle' &&
    state.display.kind == null &&
    state.display.payload == null &&
    state.items.queue.length === 0 &&
    state.action.status === 'idle' &&
    !selectOverlayVisible(state as never)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
