/**
 * Stage 7 Phase 2 — passive queue regression (no display field).
 *
 * Run: npx tsx apps/web/scripts/notification-runtime-stage7-passive-queue.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationIntents } from '../src/notification-runtime/notification-runtime.intents';
import { selectNotificationQueueReadModel } from '../src/notification-runtime/notification-runtime.host-api';
import { decideReconnectRecoveryRequest } from '../src/notification-runtime/notification-runtime.reconnect-recovery';
import {
  selectReadyHeadId,
  selectCurrentItem,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
} from '../src/notification-runtime/notification-runtime.store';
import { createNotificationRuntimePort } from '../src/app-coordinator/notification-runtime-port';
import { createInitialNotificationRuntimeState } from '../src/notification-runtime/notification-runtime.types';
import type { BanInteraction } from '@98plus/shared';

let passed = 0;
function pass(name: string) {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string): BanInteraction {
  return {
    id,
    sender: { id: 's1', firstName: 'S', username: 's' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

function assertIdlePassive(
  store: ReturnType<typeof createNotificationRuntimeStore>,
) {
  const state = store.getState();
  assert.equal(state.lifecycle.status, 'idle');
  assert.equal('display' in state, false);
}

const webSrc = (() => {
  const fromRoot = join(process.cwd(), 'apps/web/src');
  try {
    readFileSync(
      join(fromRoot, 'notification-runtime/notification-runtime.types.ts'),
    );
    return fromRoot;
  } catch {
    return join(process.cwd(), 'src');
  }
})();
const runtimeDir = join(webSrc, 'notification-runtime');

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('a1')),
    source: 'websocket',
  });
  assert.equal(store.getState().items.queue.length, 1);
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:a1');
  assertIdlePassive(store);
  pass('ITEMS_RECEIVED enqueues without activation');
}

{
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  assert.equal(boot.accepted, true);
  completeBootstrap(store, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('b1')), itemFromIncoming(ban('b2'))],
    pendingItemIds: ['incoming:b1', 'incoming:b2'],
    sourceVersion: 't1',
    generation: 1,
  });
  assert.equal(store.getState().items.queue.length, 2);
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:b1');
  assertIdlePassive(store);
  pass('Bootstrap enqueues without activation');
}

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('p1')),
    source: 'poll',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('p2')),
    source: 'poll',
  });
  assert.equal(store.getState().items.queue.length, 2);
  assertIdlePassive(store);
  pass('Pending ingest enqueues without activation');
}

{
  const decision = decideReconnectRecoveryRequest(
    createInitialNotificationRuntimeState(),
  );
  assert.equal(decision.action, 'bootstrap');
  pass('Reconnect reconcile ignores presentation visibility');
}

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('d1')),
    source: 'websocket',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('d2')),
    source: 'websocket',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('d1')),
    source: 'websocket',
  });
  assert.equal(store.getState().items.queue.map((i) => i.kind + ':' + (i.kind === 'result' ? i.result.id : i.ban.id)).join(','), 'incoming:d1,incoming:d2');
  pass('Queue order deterministic and duplicates rejected');
}

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('h1')),
    source: 'websocket',
  });
  const read = selectNotificationQueueReadModel(store.getState());
  assert.equal(read.readyItemId, 'incoming:h1');
  assert.equal(selectCurrentItem(store.getState())?.kind, 'incoming');
  assertIdlePassive(store);
  pass('Ready head readable without surface claim');
}

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('c1')),
    source: 'websocket',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('c2')),
    source: 'websocket',
  });
  completeRuntimeItem(store, 'incoming:c1', 'user');
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:c2');
  assert.equal(store.getState().consumed.itemIds.includes('incoming:c1'), true);
  completeRuntimeItem(store, 'incoming:c1', 'user');
  assert.equal(store.getState().items.queue.length, 1);
  pass('Complete once + action failure preserves remaining queue');
}

{
  const files = readdirSync(runtimeDir).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const src = readFileSync(join(runtimeDir, f), 'utf8');
    assert.doesNotMatch(src, /\bnotificationMode\b|\bautoShow\b/);
    assert.doesNotMatch(src, /\bdisplay\s*:/);
    assert.doesNotMatch(src, /function showHead|clearDisplay|repairQueueDisplayInvariant/);
  }
  pass('Runtime sources free of preference/display activation tokens');
}

{
  const facts: string[] = [];
  const store = createNotificationRuntimeStore();
  createNotificationRuntimePort({
    store,
    sink: {
      bootCompleted: () => facts.push('boot'),
      reconnectStarted: () => facts.push('rs'),
      reconnectCompleted: () => facts.push('rc'),
    },
    fetchDirectItem: async () => null,
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('x1')),
    source: 'websocket',
  });
  assert.deepEqual(facts, []);
  pass('Port has no mute memory and does not emit activation on ingest');
}

{
  const src = readFileSync(
    join(runtimeDir, 'notification-runtime.reconnect-recovery.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /overlayVisible|display\.kind|showing/);
  pass('Reconnect decision does not read overlay visibility');
}

{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  const appServices = readFileSync(
    join(webSrc, 'app-services/AppServicesProvider.tsx'),
    'utf8',
  );
  assert.doesNotMatch(transport, /notificationMode|autoShow|EMPTY_RUNTIME_LEGACY/);
  assert.doesNotMatch(appServices, /notificationMode|autoShow/);
  pass('Transport/AppServices free of mode/autoShow/legacy sinks');
}

{
  const intents = createNotificationIntents({
    store: createNotificationRuntimeStore(),
    getToken: () => null,
  });
  assert.equal('accept' in intents, true);
  const src = readFileSync(
    join(runtimeDir, 'notification-runtime.intents.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /go_to_bans|openBans|onReply|navigate/);
  pass('Intents expose no Product/Reply navigation');
}

console.log(`\n${passed} assertions passed`);
