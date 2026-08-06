/**
 * Stage 8 Phase 9I — production trace replay.
 *
 * Loads an exported production JSON trace when present and attempts to
 * reproduce the failure against real Coordinator/Runtime modules.
 *
 * Without an actual production export, this suite MUST NOT claim
 * REPLAY_REPRODUCED_PRODUCTION_FAILURE.
 *
 * Place a real export at:
 *   apps/web/scripts/fixtures/notifications-production-trace.json
 * or set NOTIFICATIONS_PRODUCTION_TRACE_PATH.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9i-production-trace-replay.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { runNotificationsSyncViaMapper } from '../src/notification-runtime/notifications-mapper';
import {
  analyzeCycleDivergence,
  assertProductionFailureShape,
  createVirtualClock,
  describeProductionTraceAvailability,
  parseNotificationsProductionTrace,
  PRODUCTION_TRACE_NOT_AVAILABLE,
  REPLAY_REPRODUCED_PRODUCTION_FAILURE,
  replayTraceIntents,
  type ModuleReplayHarness,
} from '../src/notifications/diagnostics/notifications-trace-replay';
import {
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'cmpiebpwt00rgpk0p87dyblug';
const BAN1 = 'Ban1';

const snapshot = fixtureSnapshot({
  revision: '2',
  items: [
    fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
  ],
});

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

function resolveProductionTracePath(): string | null {
  const env = process.env.NOTIFICATIONS_PRODUCTION_TRACE_PATH;
  if (env && existsSync(env)) return env;
  const candidates = [
    join(
      process.cwd(),
      'apps/web/scripts/fixtures/notifications-production-trace.json',
    ),
    join(
      process.cwd(),
      'scripts/fixtures/notifications-production-trace.json',
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function ownerLabel(owner: { type: string; domain?: string }): string {
  return owner.type === 'DOMAIN' ? String(owner.domain) : owner.type;
}

async function buildHarness(): Promise<ModuleReplayHarness> {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/notifications\/sync$/);
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const store = createNotificationRuntimeStore();
  const sync = await runNotificationsSyncViaMapper(store, {
    token: 'test-token-phase9i-replay',
  });
  assert.equal(sync.ok, true);
  globalThis.fetch = origFetch;

  const lifecycle = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'test-token-phase9i-replay',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  lifecycle.runtimePort.notifyBootCompleted();

  return {
    getOwner() {
      return ownerLabel(lifecycle.store.getState().currentOwner);
    },
    getActiveItemId() {
      return store.getState().activeItemId;
    },
    openNotifications(correlationId) {
      const result = lifecycle.openNotifications(
        correlationId ?? undefined,
      );
      return { ok: result.ok, code: result.ok ? undefined : result.code };
    },
    closeActive() {
      lifecycle.notificationsController.dispatch({
        type: 'ACTIVE_ITEM_CLOSE_REQUESTED',
      });
    },
    applyRecordedSync() {
      // Production exports sanitize sync payloads; reinjection needs richer
      // recorded mapper inputs. Counted as missing when required.
    },
  };
}

async function main() {
  process.env.NEXT_PUBLIC_API_URL =
    process.env.NEXT_PUBLIC_API_URL ??
    'https://98plusapi-production.up.railway.app';

  const path = resolveProductionTracePath();
  if (!path) {
    const avail = describeProductionTraceAvailability(null);
    assert.equal(avail.status, PRODUCTION_TRACE_NOT_AVAILABLE);
    console.log(
      'NOTE — no production trace file found; REPLAY_REPRODUCED_PRODUCTION_FAILURE cannot be claimed',
    );
    pass('production trace availability (missing — honest stop)');
  } else {
    const raw = readFileSync(path, 'utf8');
    const trace = parseNotificationsProductionTrace(raw);
    const shape = assertProductionFailureShape(trace);
    assert.ok(shape.ok, `trace shape incomplete: ${JSON.stringify(shape)}`);

    const divergence = analyzeCycleDivergence(trace);
    assert.ok(divergence.failedCycle != null);
    console.log(
      'DIVERGENCE',
      JSON.stringify(
        {
          lastSuccessfulCycle: divergence.lastSuccessfulCycle,
          failedCycle: divergence.failedCycle,
          firstDifferentStage: divergence.firstDifferentStage,
          stateDifference: divergence.stateDifference,
        },
        null,
        2,
      ),
    );

    const harness = await buildHarness();
    const clock = createVirtualClock(trace.events[0]?.monotonicTimeMs ?? 0);
    const result = replayTraceIntents(trace, harness, clock);

    if (result.missingInputs.length) {
      console.log(
        'NOTE — missing recorded sync/async inputs:',
        result.missingInputs.slice(0, 20),
      );
      console.log(
        'NOTE — improve recorder coverage; do not claim production reproduction',
      );
      assert.notEqual(result.status, REPLAY_REPRODUCED_PRODUCTION_FAILURE);
      pass(
        'production trace loaded — missing inputs reported (no false claim)',
      );
    } else if (result.status === REPLAY_REPRODUCED_PRODUCTION_FAILURE) {
      console.log(REPLAY_REPRODUCED_PRODUCTION_FAILURE);
      assert.equal(result.status, REPLAY_REPRODUCED_PRODUCTION_FAILURE);
      pass('REPLAY_REPRODUCED_PRODUCTION_FAILURE');
    } else {
      console.log(
        'NOTE — replay did not reproduce; missingInputs=',
        result.missingInputs,
        'notes=',
        result.notes,
      );
      assert.notEqual(result.status, REPLAY_REPRODUCED_PRODUCTION_FAILURE);
      pass('production trace loaded — reproduction not claimed');
    }
  }

  // Synthetic smoke: real lifecycle open/close
  {
    const harness = await buildHarness();
    assert.equal(harness.getOwner(), 'CREATE_BAN');
    const open1 = harness.openNotifications('syn-1');
    assert.ok(typeof open1.ok === 'boolean');
    if (open1.ok) {
      assert.equal(harness.getOwner(), 'NOTIFICATIONS');
      assert.equal(harness.getActiveItemId(), `incoming:${BAN1}`);
      harness.closeActive();
      // Allow effect microtask
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(harness.getOwner(), 'CREATE_BAN');
    }
    pass('synthetic harness drives real lifecycle open/close');
  }

  console.log(`\nOK — ${passed} phase9i replay checks passed`);
  console.log(
    'CLAIM: production failure reproduction = ONLY if REPLAY_REPRODUCED_PRODUCTION_FAILURE printed above',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
