/**
 * Queue lifecycle + pending authority invariants.
 *
 * Covers the b2969a5 production regressions:
 *   - indicator flicker from stale/partial empty pending snapshots;
 *   - SUCCESS handoff leaving lifecycle=draining (orb-only lobby, bans nav blocked);
 *   - SUCCESS continuation across a three item queue.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/scripts/notification-runtime-queue-lifecycle-authority.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import { planLobbyBansOpenNavigation } from '../src/lib/lobby-bans-open-navigation';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  ingestPendingSnapshot,
  nextPendingAuthorityGeneration,
} from '../src/notification-runtime/notification-runtime.pending';
import {
  selectIndicatorVisible,
  selectInteractiveLobbyChromeMayShow,
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  dismissProductionHeadAtomic,
  ingestProductionQueue,
} from '../src/notification-runtime/notification-runtime.production-advance';
import {
  executeSuccessHandoffMaterialize,
  normalizeAbandonedDrain,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incomingQueued(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

function sinks() {
  return {
    writeQueue: (_q: QueuedOverlay[]) => {},
    writeDisplay: (_p: OwnerActiveDisplayPatch) => {},
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok — ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok — ${name}`);
}

async function main() {
  // ——— INDICATOR AUTHORITY ———

  check('stale empty bootstrap cannot clear live pending', () => {
    const store = createNotificationRuntimeStore();
    ingestProductionQueue(store, [incomingQueued('I1')], 'live', sinks());
    ingestPendingSnapshot(store, ['incoming:I1'], 'live-realtime', null, 5);
    assert.equal(selectIndicatorVisible(store.getState()), true);

    store.dispatch({
      type: 'BOOTSTRAP_COMPLETED',
      transitionId: store.getState().lifecycle.transitionId ?? 'boot-stale',
      items: [],
      pendingItemIds: [],
      consumedItemIds: [],
      sourceVersion: null,
      autoShow: false,
      source: 'bootstrap',
    });
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectPendingCount(store.getState()), 1);
  });

  check('empty DATA_REFRESH_ONLY response does not flicker indicator', () => {
    const store = createNotificationRuntimeStore();
    ingestProductionQueue(store, [incomingQueued('D1')], 'live', sinks());
    ingestPendingSnapshot(store, ['incoming:D1'], 'live-realtime', null, 3);
    assert.equal(selectIndicatorVisible(store.getState()), true);

    ingestPendingSnapshot(
      store,
      [],
      'lobby-bans-cta-after-sync-open',
      null,
      4,
    );
    assert.equal(selectIndicatorVisible(store.getState()), true);
  });

  check('authoritative empty with no local item clears indicator', () => {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:E1'], 'live-realtime', null, 1);
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(store.getState().display.kind, null);

    ingestPendingSnapshot(store, [], 'pending-prefetch', null, 2);
    assert.equal(selectIndicatorVisible(store.getState()), false);
  });

  check('out-of-order: older empty resolving late is ignored', () => {
    const store = createNotificationRuntimeStore();
    const older = nextPendingAuthorityGeneration();
    const newer = nextPendingAuthorityGeneration();
    assert.ok(newer > older);

    ingestPendingSnapshot(store, ['incoming:O1'], 'pending-prefetch', null, newer);
    assert.equal(selectPendingCount(store.getState()), 1);

    ingestPendingSnapshot(store, [], 'pending-prefetch', null, older);
    assert.equal(selectPendingCount(store.getState()), 1);

    // Same-or-newer authoritative empty still clears — no permanent latch.
    ingestPendingSnapshot(
      store,
      [],
      'pending-prefetch',
      null,
      nextPendingAuthorityGeneration(),
    );
    assert.equal(selectPendingCount(store.getState()), 0);
  });

  // ——— SUCCESS CONTINUATION ———

  await checkAsync('three item queue: SUCCESS → next → SUCCESS → next', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'chain-3' });
    assert.equal(req.accepted, true);
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [
          incomingQueued('A1'),
          incomingQueued('A2'),
          incomingQueued('A3'),
        ],
      },
      sinks(),
    );
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().items.queue.length, 3);

    const order: string[] = [];
    for (let step = 0; step < 2; step += 1) {
      const queueBefore = store.getState().items.queue.map((item) =>
        item.kind === 'incoming'
          ? incomingQueued(item.ban.id)
          : incomingQueued('x'),
      );
      const head = store.getState().display.payload;
      assert.ok(head, 'display must be set before advancing');
      const targetItemId = `incoming:${queueBefore[0]!.kind === 'incoming' ? (queueBefore[0] as { ban: BanInteraction }).ban.id : ''}`;
      order.push(targetItemId);
      const dismissed = dismissProductionHeadAtomic(
        store,
        {
          queueBefore,
          targetItemId,
          reason: 'continue_chain',
          source: 'success',
        },
        sinks(),
      );
      assert.equal(dismissed.ok, true);
      assert.equal(dismissed.hasNext, true);
      // Atomic: never a lobby frame between cards.
      assert.equal(selectOverlayVisible(store.getState()), true);
      assert.equal(selectLobbyMayShow(store.getState()), false);
      assert.ok(store.getState().display.kind != null);
    }
    assert.deepEqual(order, ['incoming:A1', 'incoming:A2']);
    assert.equal(store.getState().items.queue.length, 1);
  });

  await checkAsync('empty legacy projection cannot wipe runtime queue', async () => {
    const store = createNotificationRuntimeStore();
    ingestProductionQueue(
      store,
      [incomingQueued('K1'), incomingQueued('K2')],
      'live',
      sinks(),
    );
    const req = requestSuccessHandoff(store, { transitionId: 'keep-1' });
    assert.equal(req.accepted, true);
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      { transitionId: req.transitionId, localItems: [] },
      sinks(),
    );
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().items.queue.length, 2);
  });

  await checkAsync('stale pending refresh returning [] cannot empty queue', async () => {
    const store = createNotificationRuntimeStore();
    ingestProductionQueue(store, [incomingQueued('R1')], 'live', sinks());
    const req = requestSuccessHandoff(store, { transitionId: 'stale-fetch' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [],
        fetchPendingItems: async () => [],
      },
      sinks(),
    );
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().items.queue.length, 1);
  });

  await checkAsync('failed pending fetch settles idle, never draining', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'fail-fetch' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [],
        fetchPendingItems: async () => {
          throw new Error('NETWORK');
        },
      },
      sinks(),
    );
    assert.equal(outcome, 'failed');
    assert.equal(selectIsDraining(store.getState()), false);
    assert.equal(store.getState().lifecycle.status, 'idle');
  });

  // ——— EMPTY COMPLETION / LOBBY CHROME ———

  await checkAsync('final SUCCESS with no next item → idle + full chrome', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'final-1' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      { transitionId: req.transitionId, localItems: [] },
      sinks(),
    );
    assert.equal(outcome, 'idle');
    const state = store.getState();
    assert.equal(state.lifecycle.status, 'idle');
    assert.equal(state.lifecycle.transitionId, null);
    assert.equal(state.display.kind, null);
    assert.equal(state.display.payload, null);
    assert.equal(state.action.status, 'idle');
    assert.equal(selectOverlayVisible(state), false);
    assert.equal(selectLobbyMayShow(state), true);
    assert.equal(selectInteractiveLobbyChromeMayShow(state), true);
  });

  await checkAsync('abandoned drain normalizes to idle (never orb-only)', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'abandoned-1' });
    assert.equal(selectIsDraining(store.getState()), true);
    // Orb-only lobby signature while the drain is still owned.
    assert.equal(
      selectInteractiveLobbyChromeMayShow(store.getState()),
      false,
    );

    // Materialize never runs (host aborted); the host settles the drain.
    const normalized = normalizeAbandonedDrain(
      store,
      null,
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(normalized, true);
    const state = store.getState();
    assert.equal(state.lifecycle.status, 'idle');
    assert.equal(state.lifecycle.transitionId, null);
    assert.equal(selectInteractiveLobbyChromeMayShow(state), true);
    assert.equal(
      planLobbyBansOpenNavigation({
        phaseIsIdle: true,
        banSentSuccess: false,
        runtimeDraining: selectIsDraining(state),
        alreadyOpen: false,
        openInFlight: false,
      }).openImmediately,
      true,
    );
    void req;
  });

  check('normalize never stomps a newer owner', () => {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'owner-a' });
    const newer = requestSuccessHandoff(store, { transitionId: 'owner-b' });
    assert.equal(newer.accepted, true);
    const normalized = normalizeAbandonedDrain(
      store,
      'owner-a',
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(normalized, false);
    assert.equal(store.getState().lifecycle.status, 'draining');
    assert.equal(store.getState().lifecycle.transitionId, 'owner-b');
  });

  check('normalize is a no-op when a card is showing', () => {
    const store = createNotificationRuntimeStore();
    ingestProductionQueue(store, [incomingQueued('N1')], 'live', sinks());
    assert.equal(store.getState().lifecycle.status, 'showing');
    const normalized = normalizeAbandonedDrain(
      store,
      null,
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(normalized, false);
    assert.equal(store.getState().lifecycle.status, 'showing');
  });

  // ——— HOST WIRING ———

  check('Providers settles the runtime when SUCCESS yields no card', () => {
    const providers = readFileSync(
      join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
      'utf8',
    );
    assert.ok(
      providers.includes('concludeSuccessDrainWithoutCard'),
      'missing SUCCESS drain conclusion helper',
    );
    assert.ok(
      providers.includes('normalizeAbandonedDrain('),
      'host must normalize an abandoned drain',
    );
    assert.ok(
      providers.includes('nextPendingAuthorityGeneration()'),
      'pending prefetch must stamp a request generation',
    );
    assert.ok(
      /concludeSuccessDrainWithoutCard\(`v5-success-handoff-\$\{outcome\}`\)/.test(
        providers,
      ),
      'non-showing SUCCESS outcome must conclude the drain',
    );
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
