/**
 * Stage 7 Phase 2 — physical cleanup + passive Runtime contract.
 *
 * Run: npx tsx apps/web/scripts/notification-runtime-stage7-phase2-cleanup.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
import {
  selectNotificationQueueReadModel,
  selectNotificationViewState,
} from '../src/notification-runtime/notification-runtime.host-api';
import { decideReconnectRecoveryRequest } from '../src/notification-runtime/notification-runtime.reconnect-recovery';
import {
  selectReadyHeadId,
  selectCurrentItem,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  completeRuntimeItem,
  createNotificationRuntimeStore,
} from '../src/notification-runtime/notification-runtime.store';
import { createNotificationRuntimePort } from '../src/notification-runtime/notification-runtime.coordinator-port';
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

function runtimeSourceFiles(): string[] {
  return readdirSync(runtimeDir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => join(runtimeDir, f));
}

function assertIdlePassive(store: ReturnType<typeof createNotificationRuntimeStore>) {
  const state = store.getState();
  assert.equal(state.lifecycle.status, 'idle');
  assert.equal('display' in state, false);
}

// 1. Runtime state contains no display field
{
  const state = createInitialNotificationRuntimeState();
  assert.equal('display' in state, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(state, 'display'),
    false,
  );
  pass('1. Runtime state contains no display field');
}

// 2. Lifecycle contains no showing
{
  const types = readFileSync(
    join(runtimeDir, 'notification-runtime.types.ts'),
    'utf8',
  );
  assert.doesNotMatch(types, /'showing'/);
  assert.doesNotMatch(types, /'draining'/);
  assert.doesNotMatch(types, /'completing'/);
  pass('2. Runtime lifecycle contains no showing/draining/completing');
}

// 3. No showHead / display repair
{
  const reducer = readFileSync(
    join(runtimeDir, 'notification-runtime.reducer.ts'),
    'utf8',
  );
  assert.doesNotMatch(reducer, /\bshowHead\b/);
  assert.doesNotMatch(reducer, /\bclearDisplay\b/);
  assert.doesNotMatch(reducer, /\brepairQueueDisplayInvariant\b/);
  pass('3. No showHead or display repair helper');
}

// 4–6. Ingest / bootstrap / pending enqueue only
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('a1')),
    source: 'websocket',
  });
  assert.equal(store.getState().items.queue.length, 1);
  assertIdlePassive(store);

  const store2 = createNotificationRuntimeStore();
  const boot = requestBootstrap(store2, { source: 'bootstrap' });
  completeBootstrap(store2, {
    transitionId: boot.transitionId,
    items: [itemFromIncoming(ban('b1'))],
    pendingItemIds: ['incoming:b1'],
    sourceVersion: 't1',
    generation: 1,
  });
  assert.equal(store2.getState().items.queue.length, 1);
  assertIdlePassive(store2);
  pass('4-6. Ingest/bootstrap enqueue without activation');
}

// 7. No automatic activation concept in types/events
{
  const types = readFileSync(
    join(runtimeDir, 'notification-runtime.types.ts'),
    'utf8',
  );
  assert.doesNotMatch(types, /DRAIN_REQUESTED|SUCCESS_HANDOFF|LOBBY_REQUESTED/);
  assert.doesNotMatch(types, /RUNTIME_NORMALIZE_IDLE|RECOVERY_REQUESTED/);
  assert.doesNotMatch(types, /\bDisplayMode\b|\bdisplayFromItem\b/);
  pass('7-8. Event union free of DRAIN/HANDOFF/LOBBY/RECOVERY policy');
}

// 9–10. Deleted modules
{
  for (const f of [
    'notification-runtime.success-handoff.ts',
    'notification-runtime.shell-visibility.ts',
    'notification-runtime.demolition.ts',
    'notification-runtime.snapshot.ts',
    'notification-runtime.adapters.ts',
    'notification-runtime.production-advance.ts',
  ]) {
    assert.equal(existsSync(join(runtimeDir, f)), false, f);
  }
  assert.equal(existsSync(join(webSrc, 'lib/lobby-claim-from-runtime.ts')), false);
  assert.equal(
    existsSync(join(webSrc, 'lib/deferred-sync-bootstrap-gate.ts')),
    false,
  );
  pass('9-10. success-handoff/legacy/adapters modules deleted');
}

// 11–12. Selectors / intents scans
{
  const forbiddenExact = [
    { re: /\bLOBBY\b/, label: 'LOBBY' },
    { re: /\bchrome\b/i, label: 'chrome' },
    { re: /\bctaVisible\b/, label: 'ctaVisible' },
    { re: /\boverlayVisible\b/, label: 'overlayVisible' },
    { re: /\bautoShow\b/, label: 'autoShow' },
    { re: /\bnotificationMode\b/, label: 'notificationMode' },
    { re: /\bgo_to_bans\b/, label: 'go_to_bans' },
    { re: /\bopenBans\b/, label: 'openBans' },
    { re: /\blobby[\s-]?orb\b/i, label: 'lobby orb' },
  ];
  for (const file of runtimeSourceFiles()) {
    const src = readFileSync(file, 'utf8');
    // Strip line comments before scanning to avoid historical narrative false positives.
    const scanned = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/overboard/gi, 'OB_ACTION');
    for (const { re, label } of forbiddenExact) {
      assert.equal(
        re.test(scanned),
        false,
        `${file} contains ${label}`,
      );
    }
  }
  const intents = readFileSync(
    join(runtimeDir, 'notification-runtime.intents.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(intents, /\bonReply\b|\bgo_to_bans\b|\bopenBans\b|\bopenRoute\b/);
  pass('11-12. No Lobby/chrome/CTA; intents do not navigate Product/Reply');
}

// 13. Host not mounted / no card render from ready head
{
  const surface = readFileSync(
    join(webSrc, 'app-coordinator/ApplicationSurface.tsx'),
    'utf8',
  );
  assert.doesNotMatch(surface, /DirectNotificationHost/);
  assert.equal(
    existsSync(join(webSrc, 'notification-host/DirectNotificationHost.tsx')),
    false,
  );
  const view = selectNotificationViewState(
    createNotificationRuntimeStore().getState(),
  );
  assert.equal(view.readyHead, null);
  pass('13. No Host renders queue head as active');
}

// 14. No production activation path
{
  const port = readFileSync(
    join(runtimeDir, 'notification-runtime.coordinator-port.ts'),
    'utf8',
  );
  const ports = readFileSync(
    join(webSrc, 'app-coordinator/app-coordinator.ports.ts'),
    'utf8',
  );
  assert.doesNotMatch(port, /currentChanged|queueDrained/);
  assert.doesNotMatch(ports, /currentChanged|queueDrained/);
  assert.doesNotMatch(
    readFileSync(join(webSrc, 'app-coordinator/app-coordinator.types.ts'), 'utf8'),
    /RUNTIME_CURRENT_CHANGED|RUNTIME_QUEUE_DRAINED/,
  );
  pass('14. No Runtime→Coordinator currentChanged/queueDrained path');
}

// 15–20. Queue mechanics
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('q1')),
    source: 'websocket',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('q2')),
    source: 'websocket',
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('q1')),
    source: 'websocket',
  });
  assert.equal(store.getState().items.queue.length, 2);
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:q1');
  assert.equal(selectCurrentItem(store.getState())?.kind, 'incoming');

  const read = selectNotificationQueueReadModel(store.getState());
  assert.equal(read.readyItemId, 'incoming:q1');
  assert.equal(read.queueLength, 2);

  completeRuntimeItem(store, 'incoming:q1', 'user');
  assert.equal(selectReadyHeadId(store.getState()), 'incoming:q2');
  assert.equal(store.getState().consumed.itemIds.includes('incoming:q1'), true);
  completeRuntimeItem(store, 'incoming:q1', 'user');
  assert.equal(store.getState().items.queue.length, 1);

  pass('15-20. Ready head/dedupe/consume once remain correct');
}

// Reconnect ignores visibility
{
  const state = createInitialNotificationRuntimeState();
  const decision = decideReconnectRecoveryRequest(state);
  assert.equal(decision.action, 'bootstrap');
  const reconnectSrc = readFileSync(
    join(runtimeDir, 'notification-runtime.reconnect-recovery.ts'),
    'utf8',
  );
  assert.doesNotMatch(reconnectSrc, /overlay|display|visible/i);
  pass('Reconnect decision is infrastructure-only');
}

// Port does not emit activation on ingest
{
  const facts: string[] = [];
  const store = createNotificationRuntimeStore();
  const port = createNotificationRuntimePort({
    store,
    sink: {
      bootCompleted: () => facts.push('boot'),
      reconnectStarted: () => facts.push('rs'),
      reconnectCompleted: () => facts.push('rc'),
    },
    fetchDirectItem: async () => null,
  });
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('p1')),
    source: 'websocket',
  });
  assert.deepEqual(facts, []);
  port.notifyBootCompleted('incoming:p1');
  assert.deepEqual(facts, ['boot']);
  port.dispose();
  pass('Port emits boot only; never activation on ingest');
}

// Intents exist without Product navigation
{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('i1')),
    source: 'websocket',
  });
  const intents = createNotificationIntents({
    store,
    getToken: () => null,
  });
  assert.equal(typeof intents.accept, 'function');
  pass('Intents remain queue/lifecycle only');
}

console.log(`\n${passed} assertions passed`);
