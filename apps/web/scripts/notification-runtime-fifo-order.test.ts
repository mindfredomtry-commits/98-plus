/**
 * Stage 8 Phase 5 — multi-source FIFO ordering (oldest-first).
 *
 * Backend pending-all / session.incoming are newest-first; Runtime normalizes.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-fifo-order.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import {
  selectApplicationSurfaceOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import {
  itemFromIncoming,
  receiveNotificationItem,
  receiveNotificationItems,
} from '../src/notification-runtime/notification-runtime.ingest';
import {
  compareNotificationFifoOrder,
  sortNotificationQueueFifo,
} from '../src/notification-runtime/notification-runtime.order';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createNotificationRuntimeStore,
  dismissRuntimeHead,
} from '../src/notification-runtime/notification-runtime.store';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
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
    sender: { id: 's1', firstName: 'A', username: 'a' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

function queueIds(
  store: ReturnType<typeof createNotificationRuntimeStore>,
): string[] {
  return store.getState().items.queue.map(notificationItemId);
}

const webSrc = (() => {
  const fromRoot = join(process.cwd(), 'apps/web/src');
  try {
    readFileSync(
      join(fromRoot, 'notification-runtime/notification-runtime.order.ts'),
    );
    return fromRoot;
  } catch {
    return join(process.cwd(), 'src');
  }
})();
const t1 = '2026-08-01T10:00:00.000Z';
const t2 = '2026-08-01T11:00:00.000Z';

function main(): void {
  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('1', t1)),
      source: 'websocket',
    });
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('2', t2)),
      source: 'poll',
    });
    assert.deepEqual(queueIds(store), ['incoming:1', 'incoming:2']);
    pass('1. WS then pending → [1, 2]');
  }

  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('2', t2)),
      source: 'websocket',
    });
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('1', t1)),
      source: 'poll',
    });
    assert.deepEqual(queueIds(store), ['incoming:1', 'incoming:2']);
    pass('2. Newer first, late older → normalizes to [1, 2]');
  }

  {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    assert.equal(boot.accepted, true);
    // Simulate newest-first bootstrap payload (API contract).
    completeBootstrap(store, {
      transitionId: boot.transitionId,
      items: [
        itemFromIncoming(ban('2', t2)),
        itemFromIncoming(ban('1', t1)),
      ],
      pendingItemIds: ['incoming:2', 'incoming:1'],
      sourceVersion: 'boot',
      generation: 1,
    });
    assert.deepEqual(queueIds(store), ['incoming:1', 'incoming:2']);
    pass('3. Bootstrap newest-first [2,1] → canonical [1,2]');
  }

  {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(store, {
      transitionId: boot.transitionId,
      items: [itemFromIncoming(ban('2', t2))],
      pendingItemIds: ['incoming:2'],
      sourceVersion: 'boot',
      generation: 1,
    });
    assert.deepEqual(queueIds(store), ['incoming:2']);
    // Pending later returns newest-first including duplicate 2.
    receiveNotificationItems(store, {
      items: [
        itemFromIncoming(ban('2', t2)),
        itemFromIncoming(ban('1', t1)),
      ],
      source: 'poll',
    });
    assert.deepEqual(queueIds(store), ['incoming:1', 'incoming:2']);
    pass('4. session.incoming=2 + pending [2,1] → [1,2] deduped');
  }

  {
    const same = '2026-08-01T12:00:00.000Z';
    const a = itemFromIncoming(ban('a', same));
    const b = itemFromIncoming(ban('b', same));
    assert.equal(compareNotificationFifoOrder(a, b) < 0, true);
    assert.deepEqual(
      sortNotificationQueueFifo([b, a]).map(notificationItemId),
      ['incoming:a', 'incoming:b'],
    );
    pass('5. Same createdAt → stable id tie-break');
  }

  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('1', t1)),
      source: 'websocket',
    });
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('2', t2)),
      source: 'websocket',
    });
    store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    assert.equal(selectActiveItemId(store.getState()), 'incoming:1');
    receiveNotificationItem(store, {
      item: itemFromIncoming(
        ban('0', '2026-08-01T09:00:00.000Z', 'older'),
      ),
      source: 'poll',
    });
    assert.equal(selectActiveItemId(store.getState()), 'incoming:1');
    assert.deepEqual(queueIds(store), [
      'incoming:0',
      'incoming:1',
      'incoming:2',
    ]);
    pass('6. Activate 1; ingest older → active stays 1; FIFO sorted');
  }

  {
    const runtimeStore = createNotificationRuntimeStore();
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    lifecycle.runtimePort.notifyBootCompleted();
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('1', t1, 'first')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('2', t2, 'second')),
      source: 'poll',
    });
    // Invert arrival then normalize already proven; activate oldest.
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:1');
    dismissRuntimeHead(
      runtimeStore,
      'incoming:1',
      'user_dismiss',
      'user',
    );
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'incoming:2');
    assert.equal(selectActiveItemId(runtimeStore.getState()), null);
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:2');
    pass('7-8. Complete 1 → next manual open activates 2; no auto-drain');
    lifecycle.dispose();
  }

  {
    const orderSrc = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.order.ts'),
      'utf8',
    );
    assert.match(orderSrc, /compareNotificationFifoOrder/);
    assert.match(orderSrc, /createdAt DESC|newest-first/i);

    const runtimeDir = join(webSrc, 'notification-runtime');
    for (const f of readdirSync(runtimeDir).filter((x) => x.endsWith('.ts'))) {
      if (f === 'notification-runtime.order.ts') continue;
      if (f.includes('action-result-handoff')) continue;
      const src = readFileSync(join(runtimeDir, f), 'utf8');
      if (f === 'notification-runtime.reducer.ts') {
        assert.match(src, /sortNotificationQueueFifo|reconcileQueueFifo/);
        continue;
      }
      assert.doesNotMatch(
        src,
        /sortNotificationQueueFifo|compareNotificationFifoOrder/,
      );
    }

    for (const f of [
      'notifications/notifications.controller.ts',
      'notifications/presentation/notifications.presenter.ts',
      'app-coordinator/application-policy.ts',
      'app-coordinator/ApplicationSurface.tsx',
    ]) {
      const src = readFileSync(join(webSrc, f), 'utf8');
      assert.doesNotMatch(
        src,
        /sortNotificationQueueFifo|compareNotificationFifoOrder|\.sort\(/,
      );
    }
    pass('9. One canonical comparator; no ad hoc sorts in presentation/policy');
  }

  console.log(`\n${passed} passed\n`);
}

main();
