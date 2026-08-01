/**
 * Stage 7 Phase 2 — Coordinator ↔ Runtime port integration (no activation facts).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-runtime-integration.test.ts
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
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;
const tokenFactory = createSequentialResumeTokenFactory('integration');

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function productState(route: ProductRoute = 'LOBBY'): AppCoordinatorState {
  return {
    mode: { type: 'PRODUCT', route },
    resumeDestination: { type: 'PRODUCT', route },
    lastSettledReply: null,
  };
}

function notificationState(
  itemId = 'incoming:A',
  returnRoute: ProductRoute = 'LOBBY',
): AppCoordinatorState {
  return {
    mode: { type: 'NOTIFICATION', itemId },
    resumeDestination: { type: 'PRODUCT', route: returnRoute },
    lastSettledReply: null,
  };
}

function createHarness(initialState: AppCoordinatorState) {
  const calls: string[] = [];

  const notificationRuntime: NotificationRuntimePort = {
    ingestEntry(intent) {
      calls.push(`runtime.ingest:${intent.itemId}`);
    },
    suspend({ sourceItemId, resumeToken }) {
      calls.push(`runtime.suspend:${sourceItemId}:${resumeToken}`);
    },
    resume({ resumeToken }) {
      calls.push(`runtime.resume:${resumeToken}`);
    },
    completeSourceItem({ sourceItemId, resumeToken }) {
      calls.push(`runtime.complete:${sourceItemId}:${resumeToken}`);
    },
  };

  const productFlow: ProductFlowPort = {
    openRoute({ route, context }) {
      calls.push(
        `product.open:${route}:${context?.type === 'REPLY' ? 'REPLY' : 'plain'}`,
      );
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
    harness.runtimeSink.bootCompleted({ currentItemId: null });
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('1. bootCompleted → Product');
  }

  {
    const harness = createHarness(createInitialAppCoordinatorState());
    harness.runtimeSink.bootCompleted({ currentItemId: 'incoming:X' });
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    pass('2. bootCompleted ignores currentItemId (no auto-activation)');
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
    assert.equal(harness.calls.includes('runtime.ingest:incoming:deeplink'), true);
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('3. ENTRY_ROUTED ingests without switching AppMode');
  }

  {
    const harness = createHarness(notificationState('incoming:A', 'BANS'));
    const token = tokenFactory.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'u',
      resumeToken: token,
    });
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(selectProductRoute(harness.store.getState()), 'BANS');
    assert.match(harness.calls.join(','), /runtime.complete:incoming:A/);
    pass('4. reply completion settles to Product without Runtime activation facts');
  }

  {
    const ports = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.ports.ts'),
      'utf8',
    );
    assert.doesNotMatch(ports, /currentChanged|queueDrained/);
    pass('5. production sink has no currentChanged/queueDrained');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
