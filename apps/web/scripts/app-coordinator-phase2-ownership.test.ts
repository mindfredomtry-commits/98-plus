/**
 * App Coordinator Phase 2 — ownership after Stage 7 Phase 3 (BOOT | PRODUCT only).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-phase2-ownership.test.ts
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
import { createTelegramEntryRouter } from '../src/app-coordinator/app-coordinator.entry-router';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { entryIntentToCoordinatorEvent } from '../src/app-coordinator/app-coordinator.boundaries';

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

function createHarness(
  initialState: AppCoordinatorState = createInitialAppCoordinatorState(),
) {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  let surfaces: string[] = [];

  const runtime: NotificationRuntimePort = {
    ingestEntry(intent) {
      calls.push(`ingest:${intent.itemId}`);
    },
    flushDeferredDirectEntry() {
      calls.push('flush');
    },
  };

  const productPort: ProductFlowPort = {
    openRoute({ route }) {
      calls.push(`open:${route}:plain`);
    },
  };

  const productController = createProductFlowController({
    sink: {
      routeChanged() {},
      replyCancelled() {},
      replyCompleted() {},
      flowReleased() {},
    },
  });

  const store = createAppCoordinatorStore({
    initialState,
    executor: createAppCoordinatorCommandExecutor({
      notificationRuntime: runtime,
      productFlow: productPort,
    }),
    onInvariantViolation(v) {
      violations.push(v);
    },
  });

  const runtimeSink = createNotificationRuntimeEventSink((e) => {
    store.dispatch(e);
  });
  const productSink = createProductFlowEventSink((e) => {
    store.dispatch(e);
  });

  store.subscribe((state) => {
    surfaces.push(selectApplicationSurfaceOwner(state));
  });

  return {
    store,
    calls,
    violations,
    surfaces: () => surfaces,
    runtimeSink,
    productSink,
    productController,
    resetSurfaces() {
      surfaces = [];
    },
  };
}

async function main() {
  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    pass('1. ordinary boot → Product Lobby');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted({ productRoute: 'LOBBY' });
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    assert.equal(harness.store.getState().mode.type, 'PRODUCT');
    pass('2. boot always → Product (no Notification mode)');
  }

  {
    const ports = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.ports.ts'),
      'utf8',
    );
    const types = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.types.ts'),
      'utf8',
    );
    assert.doesNotMatch(ports, /currentChanged|queueDrained|SUSPEND|COMPLETE_SOURCE/);
    assert.doesNotMatch(types, /REPLY_COMPOSE/);
    const appModeBlock = types.match(
      /export type AppMode =[\s\S]*?;\r?\n/,
    )?.[0];
    assert.ok(appModeBlock, 'AppMode type block present');
    assert.match(appModeBlock, /type:\s*'BOOTING'/);
    assert.match(appModeBlock, /type:\s*'PRODUCT'/);
    assert.doesNotMatch(appModeBlock, /NOTIFICATION/);
    assert.match(types, /type: 'BOOTING'/);
    assert.match(types, /type: 'PRODUCT'/);
    pass('3. AppMode is BOOTING | PRODUCT only; no activation sink APIs');
  }

  {
    const harness = createHarness(productState('WHO'));
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.equal(selectProductRoute(harness.store.getState()), 'WHO');
    pass('4. reconnect leaves Product owner unchanged');
  }

  {
    const harness = createHarness(productState('LOBBY'));
    harness.store.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
    assert.equal(selectProductRoute(harness.store.getState()), 'WHO');
    assert.doesNotMatch(harness.calls.join(','), /suspend/);
    assert.match(harness.calls.join(','), /open:WHO/);
    pass('5. ordinary Lobby compose → WHO without Runtime suspend');
  }

  {
    const harness = createHarness(productState('CONFIRM'));
    harness.productSink.flowReleased('LOBBY');
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    assert.match(harness.calls.join(','), /flush/);
    pass('6. Product release flushes deferred direct entry');
  }

  {
    const harness = createHarness(productState());
    const router = createTelegramEntryRouter();
    const intent = router.route({
      startParam: 'b_abc123',
      launchSource: 'telegram',
    });
    harness.store.dispatch(entryIntentToCoordinatorEvent(intent));
    harness.store.dispatch(entryIntentToCoordinatorEvent(intent));
    assert.deepEqual(
      harness.calls.filter((c) => c.startsWith('ingest:')),
      ['ingest:incoming:abc123', 'ingest:incoming:abc123'],
    );
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('7. deeplink ENTRY ingests only; AppMode stays Product');
  }

  {
    const harness = createHarness();
    harness.resetSurfaces();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
    const owners = new Set(harness.surfaces());
    assert.ok([...owners].every((o) => o === 'PRODUCT_FLOW' || o === 'BOOT'));
    pass('8. one global surface owner at a time (Boot|Product)');
  }

  {
    const surface = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    const runtimePort = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/notification-runtime-port.ts'),
      'utf8',
    );
    assert.doesNotMatch(surface, /DirectNotificationHost|NOTIFICATION_SYSTEM/);
    assert.doesNotMatch(
      runtimePort,
      /from '@\/notification-runtime\/notification-runtime\.coordinator/,
    );
    assert.match(runtimePort, /from '\.\/app-coordinator\.ports'/);
    pass('9. no Host mount; Runtime port adapter owned by Coordinator');
  }

  {
    const router = createTelegramEntryRouter();
    assert.deepEqual(
      router.route({ startParam: 'c_check1', launchSource: 'telegram' }),
      {
        type: 'NOTIFICATION',
        itemId: 'check:check1',
        notificationKind: 'status',
      },
    );
    pass('10. EntryRouter still maps Telegram prefixes to ingest intents');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
