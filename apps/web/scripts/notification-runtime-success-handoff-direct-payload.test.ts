/**
 * SUCCESS handoff must pass transport payloads directly into materialize.
 *
 * Production-faithful scenario (no seeded runtime queue [B,C,D]):
 * - runtime items.queue empty
 * - runtime pending may hold B's id
 * - overlay/legacy pending cleared before materialize
 * - transport returns complete [B,C]
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/scripts/notification-runtime-success-handoff-direct-payload.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  enableCommandLedger,
  firstDestructiveAfterShow,
  getCommandLedger,
  resetCommandLedger,
} from '../src/notification-runtime/notification-runtime.command-ledger';
import { ingestPendingSnapshot } from '../src/notification-runtime/notification-runtime.pending';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
  resolveSuccessHandoffFetchItems,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import {
  getLastStaleReplaceRejection,
  resetStaleReplaceGuardForTests,
  STALE_REPLACE_REJECTED_ACTIVE_DISPLAY,
} from '../src/notification-runtime/notification-runtime.stale-replace-guard';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

function displayId(
  store: ReturnType<typeof createNotificationRuntimeStore>,
): string | null {
  const payload = store.getState().display.payload;
  if (!payload) return null;
  if (payload.kind === 'result') return `result:${payload.result.id}`;
  return `${payload.kind}:${payload.ban.id}`;
}

function headId(
  store: ReturnType<typeof createNotificationRuntimeStore>,
): string | null {
  const head = store.getState().items.queue[0];
  return head ? notificationItemId(head) : null;
}

/**
 * Legacy/production bug pattern: await transport, then rebuild from cleared refs.
 * Kept as an explicit anti-pattern for the regression that must stay documented.
 */
async function fetchPendingItemsViaClearedLegacyRefs(args: {
  transport: QueuedOverlay[];
  overlayRef: QueuedOverlay[];
  pendingRef: QueuedOverlay[];
}): Promise<QueuedOverlay[]> {
  const _transport = args.transport;
  void _transport;
  return [...args.overlayRef, ...args.pendingRef];
}

type SpecResult = { name: string; passed: boolean; detail?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  resetStaleReplaceGuardForTests();
  resetCommandLedger();
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS — ${name}`);
  } catch (e) {
    results.push({
      name,
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    console.log(`FAIL — ${name}`);
    console.log(`       ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handoffWithFetch(
  fetchPendingItems: () => Promise<QueuedOverlay[]>,
  opts?: { pendingIds?: string[]; consumeA?: boolean },
) {
  const store = createNotificationRuntimeStore();
  assert.equal(store.getState().items.queue.length, 0, 'queue must start empty');
  if (opts?.pendingIds?.length) {
    ingestPendingSnapshot(store, opts.pendingIds, 'poll');
  }
  if (opts?.consumeA) {
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:A',
      source: 'user',
    });
  }
  const req = requestSuccessHandoff(store, { source: 'user' });
  assert.equal(req.accepted, true);
  const outcome = await executeSuccessHandoffMaterialize(
    store,
    {
      transitionId: req.transitionId,
      localItems: [], // empty — like cleared legacy + empty runtime queue
      fetchPendingItems,
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  return { store, outcome, transitionId: req.transitionId };
}

async function runSpecs() {
  console.log('\n=== SUCCESS HANDOFF DIRECT PAYLOAD SPECS ===');

  await spec('1 SUCCESS handoff materializes B directly from fetched payload', async () => {
    const transport = [incoming('B'), incoming('C')];
    const { store, outcome } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems(transport),
    );
    assert.equal(outcome, 'showing');
    assert.equal(displayId(store), 'incoming:B');
    assert.equal(store.getState().lifecycle.status, 'showing');
    assert.equal(headId(store), 'incoming:B');
    assert.equal(store.getState().items.queue.length, 2);
    assert.equal(
      notificationItemId(store.getState().items.queue[1]!),
      'incoming:C',
    );
  });

  await spec('2 fetched payload is not lost when legacy pending is cleared', async () => {
    const transport = [incoming('B'), incoming('C')];
    // Simulate: clear happened; refs empty; transport still has payloads.
    const viaLegacy = await fetchPendingItemsViaClearedLegacyRefs({
      transport,
      overlayRef: [],
      pendingRef: [],
    });
    assert.equal(viaLegacy.length, 0, 'legacy-ref rebuild is empty after clear');

    const viaTransport = resolveSuccessHandoffFetchItems(transport);
    assert.equal(viaTransport.length, 2);
    const { store, outcome } = await handoffWithFetch(async () => viaTransport);
    assert.equal(outcome, 'showing');
    assert.equal(displayId(store), 'incoming:B');
  });

  await spec('3 empty refs do not force Lobby when transport returned B', async () => {
    const { store, outcome } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems([incoming('B')]),
    );
    assert.notEqual(outcome, 'idle');
    assert.equal(outcome, 'showing');
    assert.equal(displayId(store), 'incoming:B');
  });

  await spec('4 runtime pending ID without payload triggers fetch and then shows B', async () => {
    const { store, outcome } = await handoffWithFetch(
      async () => resolveSuccessHandoffFetchItems([incoming('B'), incoming('C')]),
      { pendingIds: ['incoming:B', 'incoming:C'] },
    );
    assert.equal(store.getState().pending.itemIds.includes('incoming:B'), true);
    assert.equal(outcome, 'showing');
    assert.equal(displayId(store), 'incoming:B');
  });

  await spec('5 B is not duplicated when fetch and local payload both contain B', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { source: 'user' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [incoming('B'), incoming('C')],
        fetchPendingItems: async () =>
          resolveSuccessHandoffFetchItems([incoming('B'), incoming('C')]),
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    // localItems non-empty → fetch not called; queue still unique B,C
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().items.queue.length, 2);
    assert.equal(headId(store), 'incoming:B');
  });

  await spec('6 consumed A is filtered without filtering B', async () => {
    const { store, outcome } = await handoffWithFetch(
      async () =>
        resolveSuccessHandoffFetchItems([
          incoming('A'),
          incoming('B'),
          incoming('C'),
        ]),
      { consumeA: true },
    );
    assert.equal(outcome, 'showing');
    assert.equal(displayId(store), 'incoming:B');
    assert.equal(
      store.getState().items.queue.some((i) => notificationItemId(i) === 'incoming:A'),
      false,
    );
  });

  await spec('7 legitimate empty transport result returns Lobby', async () => {
    const { store, outcome } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems([]),
    );
    assert.equal(outcome, 'idle');
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
  });

  await spec('8 transport failure preserves existing failure behavior', async () => {
    const { store, outcome } = await handoffWithFetch(async () => {
      throw new Error('network');
    });
    assert.equal(outcome, 'failed');
    assert.equal(store.getState().lifecycle.status, 'idle');
  });

  await spec('9 B remains visible if a later stale empty replace arrives', async () => {
    const { store } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems([incoming('B'), incoming('C')]),
    );
    assert.equal(displayId(store), 'incoming:B');
    syncRuntimeQueue(store, [], 'system', nextRuntimeTransitionId('stale-empty'));
    assert.equal(displayId(store), 'incoming:B');
    assert.equal(store.getState().lifecycle.status, 'showing');
    assert.equal(
      getLastStaleReplaceRejection()?.outcome,
      STALE_REPLACE_REJECTED_ACTIVE_DISPLAY,
    );
  });

  await spec('10 final card completion still returns to full Lobby', async () => {
    const { store } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems([incoming('B')]),
    );
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: nextRuntimeTransitionId('dismiss-B'),
      targetItemId: 'incoming:B',
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
    assert.equal(store.getState().items.queue.length, 0);
  });

  await spec('11 repeated SUCCESS handoff does not create a dispatch loop', async () => {
    const store = createNotificationRuntimeStore();
    let emits = 0;
    const unsub = store.subscribe(() => {
      emits += 1;
    });
    for (let i = 0; i < 5; i += 1) {
      const req = requestSuccessHandoff(store, {
        transitionId: `success-handoff-loop:${i}`,
        source: 'user',
      });
      if (!req.accepted) continue;
      await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: req.transitionId,
          localItems: [],
          fetchPendingItems: async () =>
            resolveSuccessHandoffFetchItems([incoming('B')]),
        },
        EMPTY_RUNTIME_LEGACY_SINKS,
      );
      // Dismiss so next handoff can accept from idle/showing.
      store.dispatch({
        type: 'CARD_DISMISS_REQUESTED',
        transitionId: nextRuntimeTransitionId(`dismiss-loop-${i}`),
        targetItemId: 'incoming:B',
        reason: 'user_dismiss',
        source: 'user',
      });
    }
    unsub();
    assert.ok(emits < 40, `unexpected emit storm: ${emits}`);
    assert.equal(store.getState().lifecycle.status, 'idle');
  });

  await spec('12 card ordering remains deterministic', async () => {
    const older = {
      kind: 'incoming' as const,
      ban: { id: 'C', createdAt: '2020-01-01T00:00:00.000Z' } as BanInteraction,
    };
    const newer = {
      kind: 'incoming' as const,
      ban: { id: 'B', createdAt: '2024-01-01T00:00:00.000Z' } as BanInteraction,
    };
    const { store, outcome } = await handoffWithFetch(async () =>
      resolveSuccessHandoffFetchItems([older, newer]),
    );
    assert.equal(outcome, 'showing');
    // mergeStartupPendingChain: newer timestamp first
    assert.equal(headId(store), 'incoming:B');
  });

  await spec('anti-pattern: cleared legacy refs yield idle (documents pre-fix bug)', async () => {
    const transport = [incoming('B'), incoming('C')];
    const { outcome } = await handoffWithFetch(async () =>
      fetchPendingItemsViaClearedLegacyRefs({
        transport,
        overlayRef: [],
        pendingRef: [],
      }),
    );
    assert.equal(
      outcome,
      'idle',
      'legacy-ref rebuild after clear must idle — proves why production lost B',
    );
  });

  await spec('Providers SUCCESS path uses transport-direct fetch items', () => {
    const providers = readFileSync(
      join(__dirname, '../src/components/Providers.tsx'),
      'utf8',
    );
    // Must wire resolveSuccessHandoffFetchItems into success-exit fetchPendingItems.
    assert.match(
      providers,
      /resolveSuccessHandoffFetchItems/,
      'Providers must import/use resolveSuccessHandoffFetchItems',
    );
    // Must not rebuild solely from cleared refs after success-exit prefetch.
    const successFetchBlock = providers.slice(
      providers.indexOf("fetchPendingItems: async () => {"),
      providers.indexOf("fetchPendingItems: async () => {") + 800,
    );
    assert.match(successFetchBlock, /success-exit-v5-transport/);
    assert.match(
      successFetchBlock,
      /resolveSuccessHandoffFetchItems/,
      'success-exit fetchPendingItems must pass transport items through resolveSuccessHandoffFetchItems',
    );
    assert.doesNotMatch(
      successFetchBlock,
      /return\s*\[\s*\.\.\.overlayQueueRef\.current\s*,\s*\.\.\.pendingStartupInteractionsRef\.current\s*\]/,
      'success-exit must not return cleared legacy refs as authority',
    );
  });
}

async function runLedgerTrace() {
  console.log('\n=== STEP 6 — COMMAND LEDGER PROOF ===');
  resetCommandLedger();
  enableCommandLedger();
  resetStaleReplaceGuardForTests();

  const store = createNotificationRuntimeStore();
  ingestPendingSnapshot(store, ['incoming:B', 'incoming:C'], 'poll');
  console.log('00 pre-handoff', {
    queue: store.getState().items.queue.length,
    pending: store.getState().pending.itemIds,
  });

  const req = requestSuccessHandoff(store, { source: 'user' });
  console.log('01 SUCCESS_HANDOFF_REQUESTED', {
    accepted: req.accepted,
    lifecycle: store.getState().lifecycle.status,
  });
  assert.equal(store.getState().lifecycle.status, 'draining');

  console.log('02 local payload empty');
  const localItems: QueuedOverlay[] = [];

  console.log('03 FETCH_PENDING started');
  const transport = [incoming('B'), incoming('C')];
  const outcome = await executeSuccessHandoffMaterialize(
    store,
    {
      transitionId: req.transitionId,
      localItems,
      fetchPendingItems: async () => {
        console.log('04 FETCH_PENDING returned [B,C]');
        return resolveSuccessHandoffFetchItems(transport);
      },
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  console.log('05 fetched payload passed directly to materialize');
  console.log('06-09 after materialize', {
    outcome,
    lifecycle: store.getState().lifecycle.status,
    displayItemId: displayId(store),
    headId: headId(store),
    queueLen: store.getState().items.queue.length,
  });

  assert.equal(outcome, 'showing');
  assert.equal(displayId(store), 'incoming:B');
  assert.equal(headId(store), 'incoming:B');
  assert.equal(store.getState().lifecycle.status, 'showing');

  const ledger = getCommandLedger();
  const emptyReplaceBeforeShow = ledger.find(
    (e) =>
      e.command === 'ITEMS_RECEIVED' &&
      e.replaceQueue === true &&
      e.incomingItemCount === 0 &&
      e.lifecycleBefore === 'draining',
  );
  assert.equal(
    emptyReplaceBeforeShow,
    undefined,
    'must not ITEMS_RECEIVED items=[] before B is materialized',
  );
  const showReplace = ledger.find(
    (e) =>
      e.command === 'ITEMS_RECEIVED' &&
      e.replaceQueue === true &&
      (e.incomingItemCount ?? 0) >= 2,
  );
  assert.ok(showReplace, 'must record non-empty ITEMS_RECEIVED');
  console.log('10 outcome=showing — PASS');
  console.log('ledger sample', JSON.stringify(showReplace, null, 2));
  assert.equal(firstDestructiveAfterShow(0), null);
}

async function main() {
  await runSpecs();
  let traceOk = true;
  try {
    await runLedgerTrace();
    console.log('PASS — ledger proof');
  } catch (e) {
    traceOk = false;
    console.log('FAIL — ledger proof');
    console.log(`       ${e instanceof Error ? e.message : String(e)}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n=== SUMMARY ===');
  console.log(
    `specs: ${results.length - failed.length}/${results.length} passing; trace=${traceOk ? 'PASS' : 'FAIL'}`,
  );
  if (failed.length || !traceOk) {
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('ALL SUCCESS-HANDOFF-DIRECT-PAYLOAD CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
