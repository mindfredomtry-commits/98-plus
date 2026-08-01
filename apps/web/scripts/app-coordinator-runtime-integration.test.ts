/**
 * Stage 7 Phase 3 — Coordinator ↔ Runtime port integration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorCommandExecutor } from '../src/app-coordinator/app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  createProductFlowEventSink,
  type NotificationRuntimePort,
  type ProductFlowPort,
} from '../src/app-coordinator/app-coordinator.ports';
import { createAppCoordinatorStore } from '../src/app-coordinator/app-coordinator.store';
import {
  selectApplicationSurfaceOwner,
  selectProductRoute,
} from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function productState(route: ProductRoute = 'LOBBY'): AppCoordinatorState {
  return {
    mode: { type: 'PRODUCT', route },
    resumeDestination: { type: 'PRODUCT', route },
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

  const productFlow: ProductFlowPort = {
    openRoute({ route }) {
      calls.push(`product.open:${route}`);
    },
  };

  const store = createAppCoordinatorStore({
    initialState,
    executor: createAppCoordinatorCommandExecutor({
      notificationRuntime,
      productFlow,
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
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('1. bootCompleted → Product');
  }

  {
    const harness = createHarness(productState());
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
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('2. ENTRY_ROUTED ingests without switching AppMode');
  }

  {
    const harness = createHarness(productState('WHAT'));
    harness.productSink.flowReleased('LOBBY');
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
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
      selectApplicationSurfaceOwner(productState('LOBBY')),
      'PRODUCT_FLOW',
    );
    pass('4. no reply-compose AppMode; Product is sole non-boot owner');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
