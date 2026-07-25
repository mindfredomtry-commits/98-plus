/**
 * Protect active visible head from stale ITEMS_RECEIVED { replaceQueue:true }.
 *
 * Reproduces the 288d48d post-show race on safe main (bce27df):
 *   SUCCESS(A) → showHead(B) → stale empty replace → B must remain visible.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/scripts/notification-runtime-protect-visible-head.test.ts
 */
import assert from 'node:assert/strict';
import type { BanInteraction } from '@98plus/shared';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  enableCommandLedger,
  firstDestructiveAfterShow,
  getCommandLedger,
  resetCommandLedger,
} from '../src/notification-runtime/notification-runtime.command-ledger';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
  toRuntimeItems,
} from '../src/notification-runtime/notification-runtime.store';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import {
  getLastStaleReplaceRejection,
  resetStaleReplaceGuardForTests,
  STALE_REPLACE_REJECTED_ACTIVE_DISPLAY,
} from '../src/notification-runtime/notification-runtime.stale-replace-guard';
import { toQueuedOverlayItems } from '../src/notification-runtime/notification-runtime.production-advance';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

function compact(store: ReturnType<typeof createNotificationRuntimeStore>) {
  const s = store.getState();
  const head = s.items.queue[0] ?? null;
  const payload = s.display.payload;
  return {
    lifecycleStatus: s.lifecycle.status,
    transitionId: s.lifecycle.transitionId,
    queueLength: s.items.queue.length,
    headId: head
      ? head.kind === 'result'
        ? `result:${head.result.id}`
        : `${head.kind}:${head.ban.id}`
      : null,
    displayKind: s.display.kind,
    displayItemId: payload
      ? payload.kind === 'result'
        ? `result:${payload.result.id}`
        : `${payload.kind}:${payload.ban.id}`
      : null,
    queueTail: s.items.queue
      .slice(1)
      .map((item) =>
        item.kind === 'result'
          ? `result:${item.result.id}`
          : `${item.kind}:${item.ban.id}`,
      ),
  };
}

function showBCD() {
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: nextRuntimeTransitionId('show-B'),
    items: toRuntimeItems([incoming('B'), incoming('C'), incoming('D')]),
    replaceQueue: true,
    source: 'user',
  });
  assert.equal(store.getState().lifecycle.status, 'showing');
  assert.equal(store.getState().display.kind, 'incoming');
  assert.equal(
    store.getState().display.payload &&
      store.getState().display.payload!.kind === 'incoming' &&
      (store.getState().display.payload as { ban: { id: string } }).ban.id,
    'B',
  );
  return store;
}

type SpecResult = { name: string; passed: boolean; detail?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  resetStaleReplaceGuardForTests();
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

async function runRequiredSpecs() {
  console.log('\n=== REQUIRED REGRESSION SPECS ===');

  await spec('1 stale empty replace cannot clear visible head B', () => {
    const store = showBCD();
    syncRuntimeQueue(store, [], 'system', nextRuntimeTransitionId('stale-empty'));
    const s = compact(store);
    assert.equal(s.displayItemId, 'incoming:B');
    assert.equal(s.lifecycleStatus, 'showing');
    assert.equal(s.headId, 'incoming:B');
    assert.equal(s.queueLength, 3);
    const rejection = getLastStaleReplaceRejection();
    assert.ok(rejection);
    assert.equal(rejection!.outcome, STALE_REPLACE_REJECTED_ACTIVE_DISPLAY);
  });

  await spec('2 stale different-head replace cannot replace visible B', () => {
    const store = showBCD();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: nextRuntimeTransitionId('stale-A'),
      items: toRuntimeItems([incoming('A'), incoming('X')]),
      replaceQueue: true,
      source: 'poll',
    });
    assert.equal(compact(store).displayItemId, 'incoming:B');
    assert.equal(compact(store).headId, 'incoming:B');
    assert.equal(
      getLastStaleReplaceRejection()?.outcome,
      STALE_REPLACE_REJECTED_ACTIVE_DISPLAY,
    );
  });

  await spec('3 same-head authoritative replace preserves B and may refresh tail', () => {
    const store = showBCD();
    const owningTid = store.getState().lifecycle.transitionId!;
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: nextRuntimeTransitionId('same-head-refresh'),
      items: toRuntimeItems([
        incoming('B'),
        incoming('C'),
        incoming('E'),
      ]),
      replaceQueue: true,
      source: 'system',
    });
    const s = compact(store);
    assert.equal(s.displayItemId, 'incoming:B');
    assert.equal(s.lifecycleStatus, 'showing');
    assert.equal(s.headId, 'incoming:B');
    assert.deepEqual(s.queueTail, ['incoming:C', 'incoming:E']);
    assert.equal(getLastStaleReplaceRejection(), null);
    // Owning transition may still refresh with same head.
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: owningTid,
      items: toRuntimeItems([incoming('B'), incoming('F')]),
      replaceQueue: true,
      source: 'user',
    });
    assert.equal(compact(store).displayItemId, 'incoming:B');
    assert.deepEqual(compact(store).queueTail, ['incoming:F']);
  });

  await spec('4 empty replace is allowed when no display is active', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: nextRuntimeTransitionId('idle-seed'),
      items: toRuntimeItems([incoming('X'), incoming('Y')]),
      replaceQueue: true,
      source: 'system',
    });
    // Dismiss both to idle with no display.
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: nextRuntimeTransitionId('dismiss-X'),
      targetItemId: 'incoming:X',
      reason: 'user_dismiss',
      source: 'user',
    });
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: nextRuntimeTransitionId('dismiss-Y'),
      targetItemId: 'incoming:Y',
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);

    // Re-seed queue without display by going draining then... actually idle +
    // empty replace of empty is fine. Seed via draining path:
    store.dispatch({
      type: 'SUCCESS_HANDOFF_REQUESTED',
      transitionId: nextRuntimeTransitionId('drain-empty'),
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'draining');
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: store.getState().lifecycle.transitionId!,
      items: [],
      replaceQueue: true,
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
    assert.equal(getLastStaleReplaceRejection(), null);
  });

  await spec('5 empty replace is allowed after legitimate completion of B', () => {
    const store = showBCD();
    // Complete B then C then D via dismiss until idle.
    for (const id of ['B', 'C', 'D']) {
      store.dispatch({
        type: 'CARD_DISMISS_REQUESTED',
        transitionId: nextRuntimeTransitionId(`dismiss-${id}`),
        targetItemId: `incoming:${id}`,
        reason: 'user_dismiss',
        source: 'user',
      });
    }
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
    syncRuntimeQueue(store, [], 'system', nextRuntimeTransitionId('post-complete-empty'));
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(getLastStaleReplaceRejection(), null);
  });

  await spec('6 RESET can intentionally clear visible state', () => {
    const store = showBCD();
    store.dispatch({ type: 'RESET_REQUESTED', source: 'system' });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(store.getState().display.kind, null);
    assert.equal(store.getState().items.queue.length, 0);
  });

  await spec('7 old transition cannot clear newer display', () => {
    const store = showBCD();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'stale-older-op',
      items: [],
      replaceQueue: true,
      source: 'poll',
    });
    assert.equal(compact(store).displayItemId, 'incoming:B');
    assert.equal(compact(store).lifecycleStatus, 'showing');
  });

  await spec('8 late result from card A cannot mutate displayed card B', () => {
    const store = showBCD();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'card-A-late',
      items: toRuntimeItems([incoming('A')]),
      replaceQueue: true,
      source: 'poll',
    });
    assert.equal(compact(store).displayItemId, 'incoming:B');
    assert.equal(compact(store).headId, 'incoming:B');
  });

  await spec('9 100 repeated stale empty replaces remain no-op and stable', () => {
    const store = showBCD();
    const before = compact(store);
    let emits = 0;
    const unsub = store.subscribe(() => {
      emits += 1;
    });
    for (let i = 0; i < 100; i += 1) {
      syncRuntimeQueue(
        store,
        [],
        'system',
        nextRuntimeTransitionId(`storm-${i}`),
      );
    }
    unsub();
    const after = compact(store);
    assert.deepEqual(after, before);
    assert.equal(emits, 0, `rejected replaces must not emit (got ${emits})`);
  });

  await spec('10 no dispatch/render loop is introduced', () => {
    const store = showBCD();
    let emits = 0;
    const unsub = store.subscribe(() => {
      emits += 1;
    });
    // Mix of rejected + one legitimate same-head refresh.
    for (let i = 0; i < 20; i += 1) {
      store.dispatch({
        type: 'ITEMS_RECEIVED',
        transitionId: nextRuntimeTransitionId(`mix-stale-${i}`),
        items: [],
        replaceQueue: true,
        source: 'system',
      });
    }
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: nextRuntimeTransitionId('mix-ok'),
      items: toRuntimeItems([incoming('B'), incoming('Z')]),
      replaceQueue: true,
      source: 'system',
    });
    unsub();
    assert.equal(emits, 1, `expected exactly 1 emit for legitimate refresh, got ${emits}`);
    assert.equal(compact(store).displayItemId, 'incoming:B');
    assert.deepEqual(compact(store).queueTail, ['incoming:Z']);
  });
}

async function runProductionTrace() {
  console.log('\n=== STEP 6 — ORIGINAL PRODUCTION TRACE ===');
  resetCommandLedger();
  enableCommandLedger();
  resetStaleReplaceGuardForTests();

  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: nextRuntimeTransitionId('card-A'),
    items: toRuntimeItems([incoming('A')]),
    replaceQueue: true,
    source: 'user',
  });
  console.log('00 card A showing', JSON.stringify(compact(store)));

  const req = requestSuccessHandoff(store, { source: 'user' });
  console.log('01 SUCCESS handoff draining', JSON.stringify(compact(store)));

  const outcome = await executeSuccessHandoffMaterialize(
    store,
    {
      transitionId: req.transitionId,
      localItems: toQueuedOverlayItems(
        toRuntimeItems([incoming('B'), incoming('C'), incoming('D')]),
      ),
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  console.log(`02 B materialized outcome=${outcome}`, JSON.stringify(compact(store)));
  assert.equal(outcome, 'showing');
  assert.equal(compact(store).displayItemId, 'incoming:B');

  const beforeStale = compact(store);
  syncRuntimeQueue(
    store,
    [],
    'system',
    nextRuntimeTransitionId('legacy-overlay-project'),
  );
  const afterStale = compact(store);
  const rejection = getLastStaleReplaceRejection();
  const destructive = firstDestructiveAfterShow(0);

  console.log('03 stale empty replace received+guarded', JSON.stringify({
    before: beforeStale,
    after: afterStale,
    rejection,
    destructiveClearedDisplay: destructive?.clearedRenderableDisplay ?? false,
  }));

  assert.equal(afterStale.displayItemId, 'incoming:B');
  assert.equal(afterStale.lifecycleStatus, 'showing');
  assert.equal(afterStale.headId, 'incoming:B');
  assert.equal(afterStale.queueLength, 3);
  assert.ok(rejection);
  assert.equal(rejection!.outcome, STALE_REPLACE_REJECTED_ACTIVE_DISPLAY);
  assert.equal(destructive, null, 'ledger must not record a cleared display');

  console.log('04 display remains B — PASS');
  console.log('05 lifecycle remains showing — PASS');
  console.log('06 queue retains B as head — PASS');
  console.log('ledger entries:', getCommandLedger().length);
}

async function main() {
  await runRequiredSpecs();
  let traceOk = true;
  try {
    await runProductionTrace();
    console.log('PASS — production SUCCESS→showHead(B)→stale empty replace');
  } catch (e) {
    traceOk = false;
    console.log('FAIL — production trace');
    console.log(`       ${e instanceof Error ? e.message : String(e)}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n=== SUMMARY ===');
  console.log(
    `specs: ${results.length - failed.length}/${results.length} passing; trace=${traceOk ? 'PASS' : 'FAIL'}`,
  );
  if (failed.length > 0 || !traceOk) {
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('ALL PROTECT-VISIBLE-HEAD CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
