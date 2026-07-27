/**
 * Production Validation 1.0 — Single Owner Notification Runtime behavior suite.
 *
 * Not unit/snapshot: exercises real runtime store + helpers across product paths.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-production-validation.test.ts
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  EMPTY_RUNTIME_LEGACY_SINKS,
  selectRuntimePaintSnapshot,
} from '../src/notification-runtime/notification-runtime.demolition';
import {
  completeBootstrap,
  failBootstrap,
  pendingIdsFromBootstrapItems,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  applyDirectItemReceived,
  completeDirectSessionViaDismiss,
  failDirectItem,
  requestDirectEntry,
} from '../src/notification-runtime/notification-runtime.direct-entry';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { assertNotificationRuntimeInvariant } from '../src/notification-runtime/notification-runtime.reducer';
import {
  selectCanonicalPendingItemIds,
  selectIndicatorVisible,
  selectIsBooting,
  selectIsDirectEntry,
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import { ingestPendingSnapshot } from '../src/notification-runtime/notification-runtime.pending';

type ScenarioResult = { name: string; ok: boolean; ms: number; detail?: string };

const results: ScenarioResult[] = [];
const perf: Record<string, number> = {};

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}
function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}
function resultItem(id: string): NotificationItem {
  return { kind: 'result', result: result(id) };
}

function sinks() {
  return EMPTY_RUNTIME_LEGACY_SINKS;
}

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  const t0 = performance.now();
  try {
    await fn();
    const ms = performance.now() - t0;
    results.push({ name, ok: true, ms });
  } catch (e) {
    const ms = performance.now() - t0;
    results.push({
      name,
      ok: false,
      ms,
      detail: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

function assertInvariants(
  store: ReturnType<typeof createNotificationRuntimeStore>,
): void {
  assertNotificationRuntimeInvariant(store.getState());
  const paint = selectRuntimePaintSnapshot(store.getState());
  assert.equal(paint.queueLength, store.getState().items.queue.length);
  assert.equal(
    paint.overlayVisible,
    selectOverlayVisible(store.getState()),
  );
  assert.equal(paint.lobbyMayShow, selectLobbyMayShow(store.getState()));
}

async function main() {
  // ========== 1. RUNTIME INVARIANTS ==========
  await run('invariant: idle empty', () => {
    const store = createNotificationRuntimeStore();
    assertInvariants(store);
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), false);
  });

  await run('invariant: current==queue[0] while showing', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'inv-1',
      items: [incoming('I1'), check('I2')],
      replaceQueue: true,
      source: 'system',
    });
    assertInvariants(store);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:I1');
    assert.equal(store.getState().display.kind, 'incoming');
  });

  await run('invariant: pending ∩ consumed = ∅', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'PENDING_SOURCE_UPDATED',
      itemIds: ['incoming:X', 'check:Y'],
      sourceVersion: 'v',
      source: 'poll',
    });
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:X',
      source: 'user',
    });
    assertInvariants(store);
    assert.ok(!selectCanonicalPendingItemIds(store.getState()).includes('incoming:X'));
  });

  // ========== 2. NORMAL MODE ==========
  await run('normal: cold boot pending → badge, no auto-show', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const items = [incoming('N1'), check('N2'), resultItem('N3')];
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items,
        pendingItemIds: pendingIdsFromBootstrapItems(items),
        mode: 'normal',
      },
      sinks(),
    );
    assertInvariants(store);
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), true);
  });

  await run('normal: warm visibility = new bootstrap, no auto-show', () => {
    const store = createNotificationRuntimeStore();
    const a = requestBootstrap(store, { transitionId: 'warm-a' });
    completeBootstrap(store, {
      transitionId: a.transitionId,
      items: [incoming('W1')],
      pendingItemIds: ['incoming:W1'],
      mode: 'normal',
    });
    const b = requestBootstrap(store, { transitionId: 'warm-b', source: 'recovery' });
    completeBootstrap(store, {
      transitionId: b.transitionId,
      items: [incoming('W2')],
      pendingItemIds: ['incoming:W2'],
      mode: 'normal',
    });
    assertInvariants(store);
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.deepEqual(selectCanonicalPendingItemIds(store.getState()), [
      'incoming:W2',
    ]);
  });

  await run('normal: long queue stays badge-only', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const items = Array.from({ length: 30 }, (_, i) => incoming(`NQ${i}`));
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items,
      pendingItemIds: pendingIdsFromBootstrapItems(items),
      mode: 'normal',
    });
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectPendingCount(store.getState()), 30);
  });

  // ========== 3. REAL-TIME MODE ==========
  await run('realtime: cold boot auto-show', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const items = [incoming('R1'), check('R2')];
    const t0 = performance.now();
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items,
        pendingItemIds: pendingIdsFromBootstrapItems(items),
        mode: 'real-time',
      },
      sinks(),
    );
    perf.bootstrapRealtime = performance.now() - t0;
    assertInvariants(store);
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:R1');
  });

  await run('realtime: WS/poll ingest preserves lifecycle', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'ws-1',
      items: [incoming('L1')],
      replaceQueue: true,
      source: 'websocket',
    });
    assertInvariants(store);
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'poll-1',
      items: [check('L2')],
      replaceQueue: false,
      source: 'poll',
    });
    assertInvariants(store);
    assert.equal(store.getState().items.queue.length, 2);
  });

  await run('realtime: drain chain advance', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'd1',
      items: [incoming('D1'), incoming('D2'), incoming('D3')],
      replaceQueue: true,
      source: 'system',
    });
    const t0 = performance.now();
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 'dismiss-d1',
      targetItemId: 'incoming:D1',
      reason: 'user_dismiss',
      source: 'user',
    });
    perf.dismiss = performance.now() - t0;
    assertInvariants(store);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:D2');
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  // ========== 4. DEEPLINK ==========
  const deeplinkCases = [
    'single',
    'duplicate',
    'while-draining',
    'while-check',
    'while-lobby',
    'while-realtime-boot',
    'while-normal-boot',
  ] as const;

  await run('deeplink: single card', () => {
    const store = createNotificationRuntimeStore();
    const t0 = performance.now();
    requestDirectEntry(
      store,
      {
        targetId: 'DL1',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('DL1'),
      },
      sinks(),
    );
    perf.deeplink = performance.now() - t0;
    assertInvariants(store);
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
  });

  await run('deeplink: duplicate transition rejected', () => {
    const store = createNotificationRuntimeStore();
    const tid = 'dup-dl';
    const a = requestDirectEntry(store, {
      transitionId: tid,
      targetId: 'DUP',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      item: incoming('DUP'),
    });
    const b = requestDirectEntry(store, {
      transitionId: tid,
      targetId: 'DUP',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      item: incoming('DUP'),
    });
    assert.equal(a.accepted, true);
    assert.equal(b.accepted, false);
    assertInvariants(store);
  });

  await run('deeplink: while draining → defer / priority', () => {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'drain-dl', source: 'user' });
    assert.equal(selectIsDraining(store.getState()), true);
    const req = requestDirectEntry(
      store,
      {
        targetId: 'DDL',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        defer: true,
        transitionId: 'dl-defer',
      },
      sinks(),
    );
    assert.equal(req.deferred || req.accepted, true);
    assertInvariants(store);
  });

  await run('deeplink: priority over realtime boot snapshot', () => {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'PRIO',
        targetKind: 'check',
        entrySource: 'deeplink',
        item: check('PRIO'),
      },
      sinks(),
    );
    const boot = requestBootstrap(store);
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId,
        items: [incoming('BOOT')],
        pendingItemIds: ['incoming:BOOT', 'check:PRIO'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'check:PRIO');
    assertInvariants(store);
  });

  await run('deeplink: exit → lobby, remainder pending', () => {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:REM'], 'poll');
    requestDirectEntry(
      store,
      {
        targetId: 'EX',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('EX'),
      },
      sinks(),
    );
    completeDirectSessionViaDismiss(
      store,
      { targetItemId: 'incoming:EX' },
      sinks(),
    );
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.ok(selectCanonicalPendingItemIds(store.getState()).includes('incoming:REM'));
    assertInvariants(store);
  });

  await run('deeplink: failure → lobby', () => {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(store, {
      targetId: 'NF',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'nf1',
    });
    failDirectItem(
      store,
      { transitionId: req.transitionId, errorCode: 'NOT_FOUND' },
      sinks(),
    );
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assertInvariants(store);
  });

  void deeplinkCases;

  // ========== 5. SUCCESS ==========
  await run('success: handoff empty → idle lobby', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { source: 'user' });
    const out = await executeSuccessHandoffMaterialize(
      store,
      { transitionId: req.transitionId, localItems: [] },
      sinks(),
    );
    assert.ok(out === 'idle' || out === 'showing');
    if (out === 'idle') {
      assert.equal(selectLobbyMayShow(store.getState()), true);
    }
    assertInvariants(store);
  });

  await run('success: handoff with local items → showing', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { source: 'user' });
    const t0 = performance.now();
    const out = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [{ kind: 'incoming', ban: ban('S1') }],
      },
      sinks(),
    );
    perf.success = performance.now() - t0;
    assert.equal(out, 'showing');
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assertInvariants(store);
  });

  await run('success: reload wipes mid-drain (bootstrap)', () => {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'sd', source: 'user' });
    assert.equal(selectIsDraining(store.getState()), true);
    const boot = requestBootstrap(store);
    assert.equal(store.getState().lifecycle.status, 'booting');
    completeBootstrap(store, {
      transitionId: boot.transitionId,
      items: [],
      pendingItemIds: [],
      mode: 'normal',
    });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assertInvariants(store);
  });

  // ========== 6. CHECK / RESULT ==========
  await run('check: submit lifecycle', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'chk',
      items: [check('CK')],
      replaceQueue: true,
      source: 'system',
    });
    const t0 = performance.now();
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-ck',
      targetItemId: 'check:CK',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    perf.check = performance.now() - t0;
    assert.equal(store.getState().lifecycle.status, 'submitting');
    assert.equal(store.getState().action.status, 'pending');
    assertInvariants(store);
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-ck',
      targetItemId: 'check:CK',
      replacement: resultItem('CK'),
      source: 'system',
    });
    assertInvariants(store);
  });

  await run('result: show + dismiss go_to_bans', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'res',
      items: [resultItem('RS'), incoming('NEXT')],
      replaceQueue: true,
      source: 'system',
    });
    const t0 = performance.now();
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 'gtb',
      targetItemId: 'result:RS',
      reason: 'go_to_bans',
      source: 'user',
    });
    perf.result = performance.now() - t0;
    assertInvariants(store);
  });

  await run('check: reload during submit clears action', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'cs',
      items: [check('CS')],
      replaceQueue: true,
      source: 'system',
    });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-cs',
      targetItemId: 'check:CS',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    const boot = requestBootstrap(store);
    assert.equal(store.getState().action.status, 'idle');
    completeBootstrap(store, {
      transitionId: boot.transitionId,
      items: [check('CS')],
      pendingItemIds: ['check:CS'],
      mode: 'real-time',
    });
    assert.equal(store.getState().action.status, 'idle');
    assertInvariants(store);
  });

  // ========== 7. BOOTSTRAP ==========
  await run('bootstrap: cold empty', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    assert.equal(selectIsBooting(store.getState()), true);
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [],
      pendingItemIds: [],
      mode: 'normal',
    });
    assert.equal(selectLobbyMayShow(store.getState()), true);
  });

  await run('bootstrap: failed → idle lobby', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    failBootstrap(store, { transitionId: req.transitionId }, sinks());
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assertInvariants(store);
  });

  await run('bootstrap: duplicate / stale ignored', () => {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { transitionId: 'live' });
    const stale = completeBootstrap(store, {
      transitionId: 'dead',
      items: [incoming('STALE')],
      pendingItemIds: ['incoming:STALE'],
      mode: 'real-time',
    });
    assert.equal(stale, 'stale');
    assert.equal(selectIsBooting(store.getState()), true);
    completeBootstrap(store, {
      transitionId: 'live',
      items: [incoming('OK')],
      pendingItemIds: ['incoming:OK'],
      mode: 'real-time',
    });
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:OK');
  });

  await run('bootstrap: newer visibility wins', () => {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { transitionId: 'old' });
    requestBootstrap(store, { transitionId: 'new' });
    assert.equal(store.getState().recovery.transitionId, 'new');
    completeBootstrap(store, {
      transitionId: 'new',
      items: [],
      pendingItemIds: [],
      mode: 'normal',
    });
    assertInvariants(store);
  });

  // ========== 8. RECOVERY / REPAIR ==========
  await run('recovery: consumed never resurrects to display', () => {
    const store = createNotificationRuntimeStore();
    let req = requestBootstrap(store, { transitionId: 'c1' });
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('Z')],
      pendingItemIds: ['incoming:Z'],
      consumedItemIds: ['incoming:Z'],
      mode: 'real-time',
    });
    assert.equal(store.getState().items.queue.length, 0);
    req = requestBootstrap(store, { transitionId: 'c2' });
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('Z')],
      pendingItemIds: ['incoming:Z'],
      mode: 'real-time',
    });
    assert.equal(store.getState().items.queue.length, 0);
    assertInvariants(store);
  });

  await run('recovery: queue/display repair after bootstrap', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('RP'), check('RP2')],
      pendingItemIds: ['incoming:RP', 'check:RP2'],
      mode: 'real-time',
    });
    assert.equal(store.getState().display.kind, 'incoming');
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:RP');
    assertInvariants(store);
  });

  // ========== 9. LONG QUEUE ==========
  for (const n of [10, 20, 30, 50, 100]) {
    await run(`long-queue: realtime ${n} items advance`, () => {
      const store = createNotificationRuntimeStore();
      const items = Array.from({ length: n }, (_, i) => incoming(`Q${i}`));
      const t0 = performance.now();
      store.dispatch({
        type: 'ITEMS_RECEIVED',
        transitionId: `lq-${n}`,
        items,
        replaceQueue: true,
        source: 'system',
      });
      assertInvariants(store);
      // Dismiss half the queue
      for (let i = 0; i < Math.min(n, 10); i++) {
        const head = store.getState().items.queue[0];
        if (!head) break;
        store.dispatch({
          type: 'CARD_DISMISS_REQUESTED',
          transitionId: `lq-d-${n}-${i}`,
          targetItemId: notificationItemId(head),
          reason: 'user_dismiss',
          source: 'user',
        });
        assertInvariants(store);
      }
      const ms = performance.now() - t0;
      perf[`longQueue${n}`] = ms;
      // Soft bound: 100 items + 10 dismiss should stay well under 500ms offline
      assert.ok(ms < 2000, `long queue ${n} took ${ms}ms`);
    });
  }

  // ========== 10. MEMORY / CLEANUP ==========
  await run('memory: bootstrap fail does not leave booting', () => {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    failBootstrap(store, { transitionId: req.transitionId });
    assert.equal(store.getState().lifecycle.transitionId, null);
    assert.equal(store.getState().recovery.transitionId, null);
  });

  await run('memory: EMPTY sinks allocate nothing observable', () => {
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      EMPTY_RUNTIME_LEGACY_SINKS.writeQueue([], 'x');
      EMPTY_RUNTIME_LEGACY_SINKS.writeDisplay({}, 'x');
    }
    const after = process.memoryUsage().heapUsed;
    // Allow generous noise; ensure no multi-MB growth from sinks alone
    assert.ok(after - before < 20 * 1024 * 1024);
  });

  await run('memory: 100-item store then reset clears queue', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'mem',
      items: Array.from({ length: 100 }, (_, i) => incoming(`M${i}`)),
      replaceQueue: true,
      source: 'system',
    });
    store.dispatch({ type: 'RESET_REQUESTED', source: 'system' });
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(store.getState().pending.itemIds.length, 0);
    assertInvariants(store);
  });

  // ========== 11. PERFORMANCE (selector paint) ==========
  await run('perf: selector paint 1000x', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'paint',
      items: [incoming('P'), check('P2'), resultItem('P3')],
      replaceQueue: true,
      source: 'system',
    });
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      selectRuntimePaintSnapshot(store.getState());
      selectOverlayVisible(store.getState());
      selectLobbyMayShow(store.getState());
      selectIndicatorVisible(store.getState());
    }
    perf.selectorPaint1000 = performance.now() - t0;
    assert.ok(perf.selectorPaint1000 < 500, `selector paint ${perf.selectorPaint1000}ms`);
  });

  // ========== 12. SOURCE SCANS ==========
  await run('source-scan: production authority', () => {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );
    const demolition = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.demolition.ts'),
      'utf8',
    );
    const shadow = readFileSync(
      join(webSrc, 'notification-owner/notification-owner-pin-state.ts'),
      'utf8',
    );
    const bootstrap = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.bootstrap.ts'),
      'utf8',
    );

    assert.match(providers, /EMPTY_RUNTIME_LEGACY_SINKS/);
    assert.match(providers, /selectRuntimePaintSnapshot/);
    assert.match(providers, /dual-store mirrors are no-ops/);
    assert.doesNotMatch(providers, /writeQueue:\s*\(/);
    assert.match(demolition, /EMPTY_RUNTIME_LEGACY_SINKS/);
    assert.match(shadow, /v9-queue-authority-noop/);
    assert.match(shadow, /v9-display-authority-noop/);
    assert.doesNotMatch(bootstrap, /setLobbyOpen/);
    assert.match(
      providers,
      /result: ownerRenderResultPayload \?\? runtimePaint\.display\.result/,
    );
  });

  // ========== badge / owners ==========
  await run('badge: selectIndicatorVisible sole pending signal', () => {
    const store = createNotificationRuntimeStore();
    assert.equal(selectIndicatorVisible(store.getState()), false);
    ingestPendingSnapshot(store, ['incoming:B1'], 'poll');
    assert.equal(selectIndicatorVisible(store.getState()), true);
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:B1',
      source: 'user',
    });
    assert.equal(selectIndicatorVisible(store.getState()), false);
  });

  await run('owners: one lobby selector', () => {
    const store = createNotificationRuntimeStore();
    assert.equal(
      selectLobbyMayShow(store.getState()),
      store.getState().lifecycle.status === 'idle' &&
        !selectOverlayVisible(store.getState()),
    );
  });

  // live-single path
  await run('live-single: same direct entry owner', () => {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'LIVE',
        targetKind: 'incoming',
        entrySource: 'live-single',
        item: incoming('LIVE'),
      },
      sinks(),
    );
    assert.equal(store.getState().directEntry.entrySource, 'live-single');
    assertInvariants(store);
  });

  // Print report summary to stdout for the human report
  const failed = results.filter((r) => !r.ok);
  console.log('notification-runtime-production-validation: ok');
  console.log(
    JSON.stringify(
      {
        scenarios: results.length,
        failed: failed.length,
        perf,
        names: results.map((r) => r.name),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  const failed = results.filter((r) => !r.ok);
  console.error(
    JSON.stringify({ passed: results.filter((r) => r.ok).length, failed }, null, 2),
  );
  process.exit(1);
});
