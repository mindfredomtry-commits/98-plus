/**
 * Stage 8 Phase 1 — Coordinator ↔ Runtime port integration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorCommandExecutor } from '../src/app-coordinator/app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  createProductFlowEventSink,
  type NotificationRuntimePort,
} from '../src/app-coordinator/app-coordinator.ports';
import { createAppCoordinatorStore } from '../src/app-coordinator/app-coordinator.store';
import {
  selectApplicationSurfaceOwner,
  selectCurrentOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorState,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function createBanOwner(): AppCoordinatorState {
  return {
    currentOwner: { type: 'DOMAIN', domain: 'CREATE_BAN' },
    returnOwner: null,
  };
}

function createHarness(initialState: AppCoordinatorState) {
  const calls: string[] = [];

  const notificationRuntime: NotificationRuntimePort = {
    ingestEntry(intent) {
      calls.push(`runtime.ingest:${intent.itemId}`);
    },
    flushDeferredDirectEntry() {
      calls.push('runtime.flush');
    },
  };

  const store = createAppCoordinatorStore({
    initialState,
    executor: createAppCoordinatorCommandExecutor({
      notificationRuntime,
    }),
  });

  const runtimeSink = createNotificationRuntimeEventSink((e) => {
    store.dispatch(e);
  });
  const productSink = createProductFlowEventSink((e) => {
    store.dispatch(e);
  });

  return { store, calls, runtimeSink, productSink };
}

async function main() {
  {
    const harness = createHarness(createInitialAppCoordinatorState());
    harness.runtimeSink.bootCompleted();
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('1. bootCompleted → CREATE_BAN');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.store.dispatch({
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:deeplink',
        notificationKind: 'incoming',
      },
    });
    assert.equal(
      harness.calls.includes('runtime.ingest:incoming:deeplink'),
      true,
    );
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    pass('2. ENTRY_ROUTED ingests without switching owner');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.productSink.flowReleased('LOBBY');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(harness.calls.includes('runtime.flush'), true);
    pass('3. flowReleased flushes deferred direct entry');
  }

  {
    const types = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.types.ts'),
      'utf8',
    );
    assert.doesNotMatch(types, /REPLY_COMPOSE/);
    assert.equal(
      selectApplicationSurfaceOwner(createBanOwner()),
      'CREATE_BAN',
    );
    pass('4. no reply-compose; CREATE_BAN is sole non-boot owner in production');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
