/**
 * Post-drain bootstrap wipe regression.
 *
 * Production (sth_7286640f / sth_01e7be31):
 *   SUCCESS handoff accepted → materialize → showing
 *   → finishSendSuccessLobbyExit finally → flushDeferredSync
 *   → reloadPending → BOOTSTRAP_REQUESTED cleared display/queue
 *   → Lobby/orb
 *
 * Fix: deferred sync must keep its latch while runtime is not
 * selectLobbyMayShow(idle); retry once when idle. reloadPending refuses
 * bootstrap while selectOverlayVisible.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-deferred-sync-bootstrap-gate.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  decideDeferredSyncFlush,
  isRuntimeSafeForDeferredBootstrap,
  isRuntimeUnsafeForBootstrapRequest,
} from '../src/lib/deferred-sync-bootstrap-gate';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { requestBootstrap } from '../src/notification-runtime/notification-runtime.bootstrap';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
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

async function main() {
  console.log('\n=== DEFERRED-SYNC BOOTSTRAP GATE ===\n');

  await spec(
    'A: showing after SUCCESS — deferred sync defers; no bootstrap; card preserved',
    async () => {
      const store = createNotificationRuntimeStore();
      // Start from idle (settled bootstrap), then SUCCESS handoff → showing.
      const handoff = requestSuccessHandoff(store, { source: 'user' });
      assert.equal(handoff.accepted, true);
      assert.equal(selectIsDraining(store.getState()), true);

      const outcome = await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: handoff.transitionId,
          localItems: [incomingOverlay('B'), incomingOverlay('C')],
        },
        EMPTY_SINKS,
      );
      assert.equal(outcome, 'showing');
      const showing = store.getState();
      assert.equal(showing.lifecycle.status, 'showing');
      assert.equal(selectOverlayVisible(showing), true);
      assert.equal(isRuntimeSafeForDeferredBootstrap(showing), false);
      assert.equal(isRuntimeUnsafeForBootstrapRequest(showing), true);
      assert.equal(selectLobbyMayShow(showing), false);

      const latch = { current: true };
      const decision = decideDeferredSyncFlush(latch.current, showing);
      assert.equal(decision, 'defer-unsafe');
      // Latch must remain armed (caller must not clear on defer).
      assert.equal(latch.current, true);

      // Simulate host respecting the gate: do NOT requestBootstrap.
      const afterGate = store.getState();
      assert.equal(afterGate.lifecycle.status, 'showing');
      assert.equal(afterGate.items.queue.length, 2);
      assert.equal(
        notificationItemId(afterGate.display.payload!),
        'incoming:B',
      );

      // If host wrongly bootstrapped, card would be wiped — prove that path.
      const wrong = requestBootstrap(store, { source: 'bootstrap' });
      assert.equal(store.getState().lifecycle.status, 'booting');
      assert.equal(store.getState().items.queue.length, 0);
      assert.equal(store.getState().display.payload, null);
      assert.ok(wrong.transitionId.startsWith('bootstrap:'));
    },
  );

  await spec(
    'A2: draining — deferred sync also defers',
    () => {
      const store = createNotificationRuntimeStore();
      const handoff = requestSuccessHandoff(store, { source: 'user' });
      assert.equal(selectIsDraining(store.getState()), true);
      assert.equal(
        decideDeferredSyncFlush(true, store.getState()),
        'defer-unsafe',
      );
      assert.equal(isRuntimeUnsafeForBootstrapRequest(store.getState()), true);
      assert.equal(handoff.accepted, true);
    },
  );

  await spec(
    'B: after return to idle — deferred sync runs exactly once; bootstrap allowed',
    () => {
      // After card flow, runtime is safely idle (selectLobbyMayShow).
      const idleStore = createNotificationRuntimeStore();
      const idle = idleStore.getState();
      assert.equal(selectLobbyMayShow(idle), true);
      assert.equal(isRuntimeSafeForDeferredBootstrap(idle), true);
      assert.equal(isRuntimeUnsafeForBootstrapRequest(idle), false);

      let latch = true;
      const d1 = decideDeferredSyncFlush(latch, idle);
      assert.equal(d1, 'run');
      // Caller clears latch exactly once on run:
      latch = false;
      assert.equal(
        decideDeferredSyncFlush(latch, idle),
        'skip-empty',
        'no duplicate deferred sync',
      );

      // Bootstrap may start normally once idle.
      const boot = requestBootstrap(idleStore, { source: 'bootstrap' });
      assert.equal(boot.accepted, true);
      assert.equal(idleStore.getState().lifecycle.status, 'booting');
    },
  );

  await spec(
    'C: no stuck latch — skip-empty / defer / run partition',
    () => {
      const store = createNotificationRuntimeStore();
      assert.equal(decideDeferredSyncFlush(false, store.getState()), 'skip-empty');
      assert.equal(decideDeferredSyncFlush(true, store.getState()), 'run');

      requestSuccessHandoff(store, { source: 'user' });
      assert.equal(
        decideDeferredSyncFlush(true, store.getState()),
        'defer-unsafe',
      );
      // Latch stays true across defer decisions (protocol).
      let armed = true;
      for (let i = 0; i < 3; i++) {
        assert.equal(
          decideDeferredSyncFlush(armed, store.getState()),
          'defer-unsafe',
        );
        assert.equal(armed, true);
      }
    },
  );

  await spec(
    'HOST: flushDeferredSync keeps latch when unsafe; subscribe retries',
    () => {
      const providers = readFileSync(
        join(__dirname, '../src/components/Providers.tsx'),
        'utf8',
      );
      assert.match(providers, /decideDeferredSyncFlush/);
      assert.match(providers, /isRuntimeUnsafeForBootstrapRequest/);
      assert.match(
        providers,
        /defer-unsafe/,
        'flushDeferredSync must handle defer-unsafe without clearing latch',
      );
      assert.match(
        providers,
        /store\.subscribe/,
        'must subscribe to retry deferred sync on idle',
      );

      const flushStart = providers.indexOf(
        'const flushDeferredSync = useCallback(async () => {',
      );
      assert.ok(flushStart > 0);
      const flushEnd = providers.indexOf(
        'const scheduleDeferredSync = useCallback',
        flushStart,
      );
      const flushBody = providers.slice(flushStart, flushEnd);
      assert.match(flushBody, /decideDeferredSyncFlush/);
      assert.match(flushBody, /decision === 'defer-unsafe'/);
      // Clear latch only after run path — deferredSyncRef.current = false after defer check.
      const deferIdx = flushBody.indexOf("decision === 'defer-unsafe'");
      const clearIdx = flushBody.indexOf('deferredSyncRef.current = false');
      assert.ok(deferIdx > 0 && clearIdx > deferIdx);

      const reloadStart = providers.indexOf(
        'const reloadPending = useCallback(async () => {',
      );
      const reloadBoot = providers.indexOf('requestBootstrap(', reloadStart);
      const reloadHead = providers.slice(reloadStart, reloadBoot);
      assert.match(reloadHead, /isRuntimeUnsafeForBootstrapRequest/);
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
  console.log('ALL DEFERRED-SYNC BOOTSTRAP GATE CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
