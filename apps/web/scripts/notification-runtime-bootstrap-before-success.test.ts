/**
 * Production root cause: SUCCESS handoff rejected while lifecycle=booting.
 *
 * Trace (sth_1a12afcf):
 *   SUCCESS_EXIT → DRAIN_ENTRY → SUCCESS_HANDOFF_REQUESTED
 *   → rejected (lifecycle=booting, transitionId=bootstrap:N)
 *   → concludeSuccessDrainWithoutCard("success-handoff-rejected") → Lobby
 *
 * Cause: finishSendSuccessLobbyExit started flushDeferredSync before drain;
 * reloadPending → requestBootstrap set lifecycle=booting synchronously.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-bootstrap-before-success.test.ts
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
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectIsBooting,
  selectIsDraining,
  selectLobbyMayShow,
} from '../src/notification-runtime/notification-runtime.selectors';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}

function incomingOverlay(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

const EMPTY_SINKS = {
  writeQueue: (_q: QueuedOverlay[]) => {},
  writeDisplay: (_p: OwnerActiveDisplayPatch) => {},
};

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: message });
    console.error(`FAIL — ${name}`);
    console.error(message);
  }
}

function lifecycleLedger(
  label: string,
  store: ReturnType<typeof createNotificationRuntimeStore>,
): { label: string; status: string; transitionId: string | null } {
  const s = store.getState();
  return {
    label,
    status: s.lifecycle.status,
    transitionId: s.lifecycle.transitionId,
  };
}

async function main() {
  console.log('\n=== BOOTSTRAP-BEFORE-SUCCESS ROOT CAUSE ===\n');

  await spec(
    'REPRO: booting → SUCCESS handoff rejected (production bootstrap:N race)',
    async () => {
      const store = createNotificationRuntimeStore();
      const boot = requestBootstrap(store, { source: 'bootstrap' });
      const before = lifecycleLedger('after-bootstrap-requested', store);
      assert.equal(before.status, 'booting');
      assert.equal(before.transitionId, boot.transitionId);
      assert.ok(boot.transitionId.startsWith('bootstrap:'));

      const handoff = requestSuccessHandoff(store, { source: 'user' });
      const after = lifecycleLedger('after-success-handoff-while-booting', store);

      assert.equal(handoff.accepted, false, 'handoff must reject while booting');
      assert.equal(after.status, 'booting', 'lifecycle must remain booting');
      assert.equal(after.transitionId, boot.transitionId);
      assert.equal(selectIsDraining(store.getState()), false);
      assert.equal(selectIsBooting(store.getState()), true);

      console.log('ledger', [before, after]);
    },
  );

  await spec(
    'FIX PATH: bootstrap settles to idle before SUCCESS → handoff enters draining',
    async () => {
      const store = createNotificationRuntimeStore();
      const boot = requestBootstrap(store, { source: 'bootstrap' });
      const L1 = lifecycleLedger('1-booting', store);
      assert.equal(L1.status, 'booting');

      const outcome = completeBootstrap(
        store,
        {
          transitionId: boot.transitionId,
          items: [],
          pendingItemIds: [],
          mode: 'normal',
        },
        EMPTY_SINKS,
      );
      const L2 = lifecycleLedger('2-after-bootstrap-complete', store);
      assert.equal(outcome, 'idle');
      assert.equal(L2.status, 'idle');
      assert.equal(L2.transitionId, null);
      assert.equal(selectIsBooting(store.getState()), false);
      assert.equal(selectLobbyMayShow(store.getState()), true);

      const handoff = requestSuccessHandoff(store, { source: 'user' });
      const L3 = lifecycleLedger('3-after-success-handoff', store);
      assert.equal(handoff.accepted, true);
      assert.equal(L3.status, 'draining');
      assert.equal(selectIsDraining(store.getState()), true);
      assert.ok(L3.transitionId?.startsWith('success-handoff:'));

      const mat = await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: handoff.transitionId,
          localItems: [],
          fetchPendingItems: async () => [incomingOverlay('B')],
        },
        EMPTY_SINKS,
      );
      const L4 = lifecycleLedger('4-after-materialize', store);
      assert.equal(mat, 'showing');
      assert.equal(L4.status, 'showing');

      console.log('ledger', [L1, L2, L3, L4]);
    },
  );

  await spec(
    'FIX PATH: settled bootstrap with local queue → SUCCESS handoff shows head',
    async () => {
      const store = createNotificationRuntimeStore();
      const boot = requestBootstrap(store, { source: 'bootstrap' });
      completeBootstrap(
        store,
        {
          transitionId: boot.transitionId,
          items: [],
          pendingItemIds: [],
          mode: 'normal',
        },
        EMPTY_SINKS,
      );
      assert.equal(store.getState().lifecycle.status, 'idle');

      const handoff = requestSuccessHandoff(store, { source: 'user' });
      assert.equal(handoff.accepted, true);

      const mat = await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: handoff.transitionId,
          localItems: [incomingOverlay('B')],
        },
        EMPTY_SINKS,
      );
      assert.equal(mat, 'showing');
      assert.equal(store.getState().lifecycle.status, 'showing');
    },
  );

  await spec(
    'HOST: finishSendSuccessLobbyExit must not flushDeferredSync before drain',
    () => {
      const flow = readFileSync(
        join(__dirname, '../src/components/instant-ban/InstantBanFlow.tsx'),
        'utf8',
      );
      const fnStart = flow.indexOf(
        'const finishSendSuccessLobbyExit = useCallback(',
      );
      assert.ok(fnStart > 0, 'finishSendSuccessLobbyExit must exist');
      const fnEnd = flow.indexOf(
        'const handleSuccessExitComplete = useCallback(',
        fnStart,
      );
      assert.ok(fnEnd > fnStart);
      const body = flow.slice(fnStart, fnEnd);

      const drainAt = body.indexOf('drainNextNotificationAfterSuccess(');
      assert.ok(drainAt > 0, 'must call drainNextNotificationAfterSuccess');

      // Any flushDeferredSync before the drain call is the production race.
      const beforeDrain = body.slice(0, drainAt);
      assert.doesNotMatch(
        beforeDrain,
        /flushDeferredSync\s*\(/,
        'flushDeferredSync must not run before drain (bootstrap race)',
      );

      // Deferred sync must still exist after drain (finally / after-drain).
      const afterDrain = body.slice(drainAt);
      assert.match(
        afterDrain,
        /flushDeferredSync\s*\(/,
        'deferred sync must still run after drain settles',
      );
      assert.match(
        body,
        /after-drain|AFTER success handoff drain|must run AFTER/i,
      );
    },
  );

  await spec(
    'HOST: reloadPending / flushDeferredSync block bootstrap during success exit',
    () => {
      const providers = readFileSync(
        join(__dirname, '../src/components/Providers.tsx'),
        'utf8',
      );
      assert.match(
        providers,
        /isSuccessExitInProgress/,
        'Providers must import/use isSuccessExitInProgress',
      );

      const reloadStart = providers.indexOf(
        'const reloadPending = useCallback(async () => {',
      );
      assert.ok(reloadStart > 0);
      const reloadBoot = providers.indexOf('requestBootstrap(', reloadStart);
      assert.ok(reloadBoot > reloadStart);
      const reloadHead = providers.slice(reloadStart, reloadBoot);
      assert.match(
        reloadHead,
        /isSuccessExitInProgress\s*\(\s*\)/,
        'reloadPending must refuse bootstrap while success exit in progress',
      );

      const flushStart = providers.indexOf(
        'const flushDeferredSync = useCallback(async () => {',
      );
      assert.ok(flushStart > 0);
      const flushClear = providers.indexOf(
        'deferredSyncRef.current = false',
        flushStart,
      );
      assert.ok(flushClear > flushStart);
      const flushHead = providers.slice(flushStart, flushClear);
      assert.match(
        flushHead,
        /isSuccessExitInProgress\s*\(\s*\)/,
        'flushDeferredSync must keep latch while success exit in progress',
      );
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log(
    `specs: ${results.length - failed.length}/${results.length} passing`,
  );
  if (failed.length) {
    for (const f of failed) console.error(` - ${f.name}: ${f.error}`);
    process.exit(1);
  }
  console.log('ALL BOOTSTRAP-BEFORE-SUCCESS CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
