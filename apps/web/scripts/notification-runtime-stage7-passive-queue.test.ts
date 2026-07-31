/**
 * Stage 7 Phase 1 — passive Notification Runtime contract.
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
import {
  createNotificationIntents,
} from '../src/notification-runtime/notification-runtime.intents';
import { selectNotificationViewState } from '../src/notification-runtime/notification-runtime.host-api';
import { decideReconnectRecoveryRequest } from '../src/notification-runtime/notification-runtime.reconnect-recovery';
import {
  selectReadyHeadId,
  selectCurrentItem,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
  notificationItemId,
} from '../src/notification-runtime/notification-runtime.store';
import { createNotificationRuntimePort } from '../src/notification-runtime/notification-runtime.coordinator-port';
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

function assertIdleNoClaim(store: ReturnType<typeof createNotificationRuntimeStore>) {
  const state = store.getState();
  assert.equal(state.lifecycle.status, 'idle');
  assert.equal(state.display.kind, null);
  assert.equal(state.display.payload, null);
}

const webSrc = (() => {
  const fromRoot = join(process.cwd(), 'apps/web/src');
  try {
    readFileSync(join(fromRoot, 'notification-runtime/notification-runtime.types.ts'));
    return fromRoot;
  } catch {
    return join(process.cwd(), 'src');
  }
})();
const runtimeDir = join(webSrc, 'notification-runtime');

// 1. ITEMS_RECEIVED enqueues but does not activate
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('a1')),
    source: 'websocket',
  });
  assert.equal(store.getState().items.queue.length, 1);
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:a1');
  assertIdleNoClaim(store);
  pass('ITEMS_RECEIVED enqueues without activation');
}

// 2. Bootstrap enqueues without activation
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
  assertIdleNoClaim(store);
  pass('Bootstrap enqueues without activation');
}

// 3. Pending refresh style merge does not activate
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
  assertIdleNoClaim(store);
  pass('Pending ingest enqueues without activation');
}

// 4. Reconnect decision ignores presentation residue
{
  const decision = decideReconnectRecoveryRequest({
    lifecycle: { status: 'showing', source: 'test', transitionId: null },
    items: { queue: [] },
    display: { kind: null, payload: null, mode: 'normal' },
    action: {
      status: 'idle',
      commandId: null,
      targetItemId: null,
      errorCode: null,
    },
    pending: { itemIds: [], sourceVersion: null, generation: 0 },
    consumed: { itemIds: [] },
    recovery: { status: 'idle', snapshotVersion: null, transitionId: null },
    directEntry: {
      active: false,
      transitionId: null,
      targetId: null,
      targetKind: null,
      entrySource: null,
      returnPolicy: null,
      deferred: null,
    },
  });
  assert.equal(decision.action, 'bootstrap');
  pass('Reconnect reconcile ignores presentation visibility');
}

// 5–6. Deterministic order + dedupe
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
  const ids = store.getState().items.queue.map(notificationItemId);
  assert.deepEqual(ids, ['incoming:d1', 'incoming:d2']);
  pass('Queue order deterministic and duplicates rejected');
}

// 7. Ready head readable while no active/visible claim
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('h1')),
    source: 'websocket',
  });
  const view = selectNotificationViewState(store.getState());
  assert.equal(view.phase, 'READY');
  assert.equal(view.readyHeadId, 'incoming:h1');
  assert.equal(view.readyHead?.kind, 'incoming');
  assertIdleNoClaim(store);
  pass('Ready head readable without surface claim');
}

// 8–10. Action lifecycle on prepared head; complete once; failure keeps queue
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('x1')),
    source: 'test',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('x2')),
    source: 'test',
  });
  const headId = selectReadyHeadId(store.getState());
  assert.ok(headId);
  completeRuntimeItem(store, headId!, 'user');
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:x2');
  assert.ok(store.getState().consumed.itemIds.includes('incoming:x1'));
  assertIdleNoClaim(store);

  // Failed action leaves remaining queue
  const cmd = 'cmd-fail';
  store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: cmd,
    targetItemId: 'incoming:x2',
    action: 'incoming_overboard',
    source: 'user',
  });
  store.dispatch({
    type: 'CARD_ACTION_FAILED',
    commandId: cmd,
    targetItemId: 'incoming:x2',
    errorCode: 'TEST_FAIL',
    source: 'user',
  });
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:x2');
  assert.equal(store.getState().items.queue.length, 1);
  pass('Complete once + action failure preserves remaining queue');
}

// 11–14. Architecture: no preference / Product routes / Lobby / Product intents
{
  const files = readdirSync(runtimeDir).filter(
    (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
  );
  const forbidden = [
    'notificationMode',
    'autoShow',
    'real-time',
    'lobbyMayShow',
    'selectLobbyMayShow',
    'selectInteractiveLobbyChromeMayShow',
    'selectHoldLobbyOrbForBootstrap',
    'ctaVisible',
    'go_to_bans',
    'openBans',
    'EMPTY_RUNTIME_LEGACY_SINKS',
  ];
  // Semantic Product route tokens in production runtime sources (exclude stubs/comments carefully)
  const productRoutes = ['WHO', 'WHAT', 'CONFIRM', 'BANS', 'SETTINGS', 'PREMIUM', 'PROFILE'];
  const allowList = new Set([
    'notification-runtime.success-handoff.ts', // stub throws
    'notification-runtime.shell-visibility.ts', // stub throws
    'notification-runtime.demolition.ts', // residual EMPTY constant unused by live path
  ]);

  for (const file of files) {
    if (allowList.has(file)) continue;
    if (file.includes('success-handoff') || file.includes('shell-visibility')) continue;
    const text = readFileSync(join(runtimeDir, file), 'utf8');
    for (const token of forbidden) {
      if (token === 'EMPTY_RUNTIME_LEGACY_SINKS' && file.includes('demolition')) continue;
      assert.equal(
        text.includes(token),
        false,
        `${file} must not contain ${token}`,
      );
    }
    // Product route word boundaries in code (ignore SUCCESS as BanResult status strings are rare)
    for (const route of productRoutes) {
      const re = new RegExp(`['"\`]${route}['"\`]`);
      assert.equal(
        re.test(text),
        false,
        `${file} must not name Product route ${route}`,
      );
    }
  }

  const intentsSrc = readFileSync(
    join(runtimeDir, 'notification-runtime.intents.ts'),
    'utf8',
  );
  assert.equal(intentsSrc.includes('onReply'), false);
  assert.equal(intentsSrc.includes('onOpenBans'), false);
  assert.equal(intentsSrc.includes('reply('), false);

  const hostApi = readFileSync(
    join(runtimeDir, 'notification-runtime.host-api.ts'),
    'utf8',
  );
  assert.equal(hostApi.includes('LOBBY'), false);
  assert.equal(hostApi.includes('ctaVisible'), false);
  assert.equal(hostApi.includes('chrome'), false);
  assert.equal(hostApi.includes('orb'), false);

  pass('Runtime sources free of preference/Lobby/Product navigation tokens');
}

// 15. Port has no mute/suspend memory
{
  const store = createNotificationRuntimeStore();
  const facts: string[] = [];
  const port = createNotificationRuntimePort({
    store,
    sink: {
      bootCompleted: () => facts.push('boot'),
      currentChanged: (id) => facts.push(`current:${id}`),
      queueDrained: () => facts.push('drained'),
      reconnectStarted: () => facts.push('reconn-start'),
      reconnectCompleted: () => facts.push('reconn-done'),
    },
    fetchDirectItem: async () => itemFromIncoming(ban('z')),
  });
  port.suspend({ sourceItemId: 'incoming:x', resumeToken: null });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('mute1')),
    source: 'websocket',
  });
  assert.equal(facts.some((f) => f.startsWith('current:')), false);
  port.notifyBootCompleted('incoming:mute1');
  assert.deepEqual(facts.filter((f) => f === 'boot'), ['boot']);
  // Boot always reports null activation to Coordinator (second call ignored)
  port.dispose();
  pass('Port has no mute memory and does not emit currentChanged on ingest');
}

// 16. Reconnect decision source has no overlayVisible
{
  const src = readFileSync(
    join(runtimeDir, 'notification-runtime.reconnect-recovery.ts'),
    'utf8',
  );
  assert.equal(src.includes('overlayVisible'), false);
  assert.equal(src.includes('selectOverlayVisible'), false);
  pass('Reconnect decision does not read overlay visibility');
}

// 19. Live transport/bootstrap path does not pass legacy sinks
{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.equal(transport.includes('EMPTY_RUNTIME_LEGACY_SINKS'), false);
  assert.equal(transport.includes('notificationMode'), false);
  assert.equal(transport.includes('autoShow'), false);
  const services = readFileSync(
    join(webSrc, 'app-services/AppServicesProvider.tsx'),
    'utf8',
  );
  assert.equal(services.includes('notificationMode'), false);
  pass('Transport/AppServices free of mode/autoShow/legacy sinks');
}

{
  const store = createNotificationRuntimeStore();
  const intents = createNotificationIntents({
    store,
    getToken: () => null,
  });
  assert.equal('reply' in intents, false);
  assert.equal('openBansCta' in intents, false);
  pass('Intents expose no Product/Reply navigation');
}

console.log(`\n${passed} assertions passed`);
