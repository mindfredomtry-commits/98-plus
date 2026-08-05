/**
 * Stage 8 Phase 9E — single-flight Sync concurrency races.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9e-single-flight.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  beginSyncFlight,
  completeSyncFlight,
  createInitialSyncFlightState,
  latchPendingFullSync,
} from '../src/notification-runtime/notification-runtime.sync-flight';
import { applyNotificationsDeltaToStore } from '../src/notification-runtime/notifications-mapper';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { fixtureContractIncoming } from './fixtures/notifications-contract-v1-fixture';
import type { NotificationsDeltaV1 } from '@98plus/shared';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

const webSrc = join(__dirname, '../src');

function gapDelta(revision: string): NotificationsDeltaV1 {
  return {
    type: 'DELTA',
    fromRevision: '0',
    revision,
    operations: [
      {
        type: 'UPSERT_ITEM',
        revision,
        item: fixtureContractIncoming({
          banId: `b${revision}`,
          userId: 'u',
          sequence: revision,
        }),
      },
    ],
  };
}

console.log('\n=== PHASE 9E SINGLE-FLIGHT RACES ===\n');

{
  // 1. bootstrap in flight + WS REVISION_GAP → pending → settle → one full Snapshot
  let state = createInitialSyncFlightState();
  const boot = beginSyncFlight(state, 'bootstrap');
  assert.equal(boot.accepted, true);
  if (!boot.accepted) throw new Error('unreachable');
  state = boot.state;
  assert.equal(state.inFlight, true);

  const latched = latchPendingFullSync(state);
  assert.equal(latched.shouldStartNow, false);
  state = latched.state;
  assert.equal(state.pendingFullSync, true);

  const parallel = beginSyncFlight(state, 'user');
  assert.equal(parallel.accepted, false);
  if (parallel.accepted) throw new Error('unreachable');
  state = parallel.state;
  assert.equal(state.pendingFullSync, true);

  const done = completeSyncFlight(state, {
    generation: boot.generation,
    reason: 'bootstrap',
    ok: true,
    coldBootSettled: false,
    sessionMatches: true,
  });
  assert.equal(done.shouldRunPendingFullSync, true);
  assert.equal(done.state.pendingFullSync, false);
  assert.equal(done.state.inFlight, false);

  const follow = beginSyncFlight(done.state, 'user');
  assert.equal(follow.accepted, true);
  if (!follow.accepted) throw new Error('unreachable');
  assert.equal(follow.forceFullSnapshot, true);
  pass('1. bootstrap in flight + WS gap → pending → exactly one full Snapshot');
}

{
  // 2. reconnect in flight + WS REVISION_GAP → no drop → one full Snapshot
  let state = createInitialSyncFlightState();
  const recon = beginSyncFlight(state, 'reconnect');
  assert.equal(recon.accepted, true);
  if (!recon.accepted) throw new Error('unreachable');
  state = recon.state;

  // Reconnect must NOT bypass the lock
  const bypass = beginSyncFlight(state, 'reconnect');
  assert.equal(bypass.accepted, false);
  if (bypass.accepted) throw new Error('unreachable');
  assert.equal(bypass.reason, 'in-flight-coalesced');

  state = latchPendingFullSync(state).state;
  assert.equal(state.pendingFullSync, true);

  const done = completeSyncFlight(state, {
    generation: recon.generation,
    reason: 'reconnect',
    ok: true,
    coldBootSettled: true,
    sessionMatches: true,
  });
  assert.equal(done.shouldRunPendingFullSync, true);
  assert.equal(done.shouldNotifyReconnectCompleted, true);
  pass('2. reconnect in flight + WS gap → no drop → one full Snapshot');
}

{
  // 3. two WS gaps while in flight → one pending, not two follow-ups
  let state = createInitialSyncFlightState();
  const boot = beginSyncFlight(state, 'bootstrap');
  if (!boot.accepted) throw new Error('unreachable');
  state = boot.state;
  state = latchPendingFullSync(state).state;
  state = latchPendingFullSync(state).state;
  assert.equal(state.pendingFullSync, true);

  const done = completeSyncFlight(state, {
    generation: boot.generation,
    reason: 'bootstrap',
    ok: true,
    coldBootSettled: false,
    sessionMatches: true,
  });
  assert.equal(done.shouldRunPendingFullSync, true);
  // Only one follow-up signal — boolean latch, not a counter.
  assert.equal(done.state.pendingFullSync, false);
  pass('3. two WS gaps while in flight → one pending full Snapshot');
}

{
  // 4. stale generation completion cannot clear current in-flight ownership
  let state = createInitialSyncFlightState();
  const first = beginSyncFlight(state, 'bootstrap');
  if (!first.accepted) throw new Error('unreachable');
  // Simulate supersede: manually advance to a newer owner (as if a newer
  // begin somehow won — completeSyncFlight must still protect).
  state = {
    ...first.state,
    generation: first.generation + 1,
    ownerGeneration: first.generation + 1,
    inFlight: true,
  };
  const stale = completeSyncFlight(state, {
    generation: first.generation,
    reason: 'bootstrap',
    ok: true,
    coldBootSettled: false,
    sessionMatches: true,
  });
  assert.equal(stale.isOwner, false);
  assert.equal(stale.shouldClearInFlight, false);
  assert.equal(stale.shouldNotifyBootCompleted, false);
  assert.equal(stale.state.inFlight, true);
  assert.equal(stale.state.ownerGeneration, first.generation + 1);
  pass('4. stale generation completion cannot clear newer in-flight ownership');
}

{
  // 5. token/user change → stale lifecycle completion ignored
  let state = createInitialSyncFlightState();
  const boot = beginSyncFlight(state, 'bootstrap');
  if (!boot.accepted) throw new Error('unreachable');
  state = boot.state;
  const done = completeSyncFlight(state, {
    generation: boot.generation,
    reason: 'bootstrap',
    ok: true,
    coldBootSettled: false,
    sessionMatches: false,
  });
  assert.equal(done.isOwner, true);
  assert.equal(done.shouldClearInFlight, true);
  assert.equal(done.shouldNotifyBootCompleted, false);
  assert.equal(done.shouldNotifyReconnectCompleted, false);
  assert.equal(done.shouldRunPendingFullSync, false);
  pass('5. token/user mismatch → stale lifecycle completion ignored');
}

{
  // 6. failed current sync + pending full sync → pending still executes once
  let state = createInitialSyncFlightState();
  const boot = beginSyncFlight(state, 'bootstrap');
  if (!boot.accepted) throw new Error('unreachable');
  state = latchPendingFullSync(boot.state).state;
  const done = completeSyncFlight(state, {
    generation: boot.generation,
    reason: 'bootstrap',
    ok: false,
    coldBootSettled: false,
    sessionMatches: true,
  });
  assert.equal(done.shouldRunPendingFullSync, true);
  pass('6. failed sync + pending → pending full sync still executes once');
}

{
  // 7. full Snapshot in flight + further REQUEST_FULL_SYNC → coalesce, no loop
  let state = createInitialSyncFlightState();
  const full = beginSyncFlight(state, 'user');
  if (!full.accepted) throw new Error('unreachable');
  assert.equal(full.forceFullSnapshot, true);
  state = latchPendingFullSync(full.state).state;
  assert.equal(state.pendingFullSync, true);

  const done = completeSyncFlight(state, {
    generation: full.generation,
    reason: 'user',
    ok: true,
    coldBootSettled: true,
    sessionMatches: true,
  });
  // Successful full Snapshot already satisfies the latch — no second loop.
  assert.equal(done.shouldRunPendingFullSync, false);
  assert.equal(done.state.pendingFullSync, false);

  // Failed full Snapshot with pending still retries once.
  let state2 = createInitialSyncFlightState();
  const full2 = beginSyncFlight(state2, 'user');
  if (!full2.accepted) throw new Error('unreachable');
  state2 = latchPendingFullSync(full2.state).state;
  const failDone = completeSyncFlight(state2, {
    generation: full2.generation,
    reason: 'user',
    ok: false,
    coldBootSettled: true,
    sessionMatches: true,
  });
  assert.equal(failDone.shouldRunPendingFullSync, true);
  pass('7. full Snapshot in flight + REQUEST_FULL_SYNC → coalesced, no infinite loop');
}

{
  // Dispatch returns effects for this exact apply (not getLastEffects coupling).
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 't',
    source: 'bootstrap',
  });
  const applied = applyNotificationsDeltaToStore(store, {
    delta: gapDelta('1'),
    source: 'websocket',
  });
  assert.ok(applied.effects.some((e) => e.type === 'REQUEST_FULL_SYNC'));
  assert.equal(store.getLastEffects(), applied.effects);
  pass('applyNotificationsDeltaToStore returns exact dispatch effects');
}

{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.match(transport, /beginSyncFlight|completeSyncFlight|latchPendingFullSync/);
  assert.match(transport, /applied\.effects/);
  assert.doesNotMatch(transport, /store\.getLastEffects\(\)/);
  assert.doesNotMatch(transport, /reason !== 'reconnect'/);
  assert.match(
    transport,
    /WS delta REQUEST_FULL_SYNC is consumed only here/,
  );
  assert.doesNotMatch(transport, /\/bans\/session|pending-all|reloadPending/);

  const controller = readFileSync(
    join(webSrc, 'notifications/notifications.controller.ts'),
    'utf8',
  );
  // Controller may drain REQUEST_FULL_SYNC from its own dispatches only,
  // via onRefresh → Transport single-flight (no parallel path).
  assert.match(controller, /onRequestFullSync/);
  assert.match(controller, /onRefresh\?\.\('user'\)/);
  pass('effect-consumption rule: Transport WS uses dispatch effects; no reconnect bypass; no legacy');
}

console.log(`\n${passed} passed\n`);
