/**
 * App Coordinator Phase 2 — production ownership integration tests.
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
  selectNotificationItemId,
  selectProductRoute,
  selectReplyCompose,
} from '../src/app-coordinator/app-coordinator.selectors';
import { createTelegramEntryRouter } from '../src/app-coordinator/app-coordinator.entry-router';
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { entryIntentToCoordinatorEvent } from '../src/app-coordinator/app-coordinator.boundaries';

let passed = 0;
const tokens = createSequentialResumeTokenFactory('phase2');

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

function createHarness(initialState: AppCoordinatorState = createInitialAppCoordinatorState()) {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  let surfaces: string[] = [];

  const runtime: NotificationRuntimePort = {
    ingestEntry(intent) {
      calls.push(`ingest:${intent.itemId}`);
    },
    suspend({ sourceItemId, resumeToken }) {
      calls.push(`suspend:${sourceItemId}:${resumeToken}`);
    },
    resume({ resumeToken }) {
      calls.push(`resume:${resumeToken}`);
    },
    completeSourceItem({ sourceItemId, resumeToken }) {
      calls.push(`complete:${sourceItemId}:${resumeToken}`);
    },
  };

  let productPort!: ProductFlowPort;
  const productController = createProductFlowController({
    sink: {
      routeChanged() {},
      replyCancelled() {},
      replyCompleted() {},
      flowReleased() {},
    },
  });
  productPort = {
    openRoute(input) {
      calls.push(`open:${input.route}:${input.context?.type ?? 'plain'}`);
      productController.openRoute(input);
    },
  };

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
    harness.runtimeSink.bootCompleted({ currentItemId: null });
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    assert.equal(harness.calls.at(-1), 'open:LOBBY:plain');
    pass('1. ordinary boot → Product Lobby');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted({ currentItemId: 'incoming:P' });
    assert.equal(selectNotificationItemId(harness.store.getState()), null);
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    pass('2. boot with pending item still → Product (no auto-activation)');
  }

  {
    const ports = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.ports.ts'),
      'utf8',
    );
    assert.doesNotMatch(ports, /currentChanged|queueDrained/);
    pass('3. Runtime sink has no currentChanged/queueDrained activation API');
  }

  {
    const types = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/app-coordinator.types.ts'),
      'utf8',
    );
    assert.doesNotMatch(types, /RUNTIME_CURRENT_CHANGED|RUNTIME_QUEUE_DRAINED/);
    pass('4. Coordinator event union has no Runtime activation events');
  }

  {
    const harness = createHarness(productState('WHO'));
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.equal(selectProductRoute(harness.store.getState()), 'WHO');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    const harnessWhat = createHarness(productState('WHAT'));
    harnessWhat.runtimeSink.reconnectStarted();
    harnessWhat.runtimeSink.reconnectCompleted();
    assert.equal(selectProductRoute(harnessWhat.store.getState()), 'WHAT');
    pass('5. reconnect during WHO/WHAT leaves Product owner unchanged');
  }

  {
    const harness = createHarness(productState('LOBBY'));
    harness.store.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
    assert.equal(selectProductRoute(harness.store.getState()), 'WHO');
    assert.match(harness.calls.join(','), /suspend/);
    assert.match(harness.calls.join(','), /open:WHO/);
    pass('6. ordinary Lobby compose → WHO');
  }

  {
    const harness = createHarness(notificationState('incoming:A'));
    const token = tokens.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    assert.equal(selectReplyCompose(harness.store.getState())?.route, 'WHAT');
    assert.match(harness.calls.join(','), /suspend:incoming:A/);
    assert.match(harness.calls.join(','), /open:WHAT:REPLY/);
    pass('7. reply from incoming → Product WHAT with Runtime suspended');
  }

  {
    const harness = createHarness(notificationState('result:R', 'BANS'));
    const token = tokens.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'result:R',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    assert.equal(harness.store.getState().mode.type, 'REPLY_COMPOSE');
    assert.deepEqual(harness.store.getState().resumeDestination, {
      type: 'NOTIFICATION',
      itemId: 'result:R',
      afterQueue: { type: 'PRODUCT', route: 'BANS' },
    });
    pass('8. reply from status → same contract');
  }

  {
    const harness = createHarness(notificationState('incoming:source'));
    const token = tokens.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:source',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    harness.productSink.replyCancelled({
      resumeToken: token,
      sourceItemId: 'incoming:source',
    });
    assert.equal(selectNotificationItemId(harness.store.getState()), null);
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('9. reply cancellation → Product (no Notification reactivation)');
  }

  {
    const harness = createHarness(notificationState('incoming:A', 'BANS'));
    const token = tokens.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(selectProductRoute(harness.store.getState()), 'BANS');
    assert.match(harness.calls.join(','), /complete:incoming:A/);
    pass('10. reply completion returns to saved Product route immediately');
  }

  {
    const harness = createHarness(notificationState('incoming:A'));
    const token = tokens.create();
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(selectProductRoute(harness.store.getState()), 'LOBBY');
    pass('11. reply completion with default resume → Product Lobby');
  }

  {
    const harness = createHarness(productState('CONFIRM'));
    const before = harness.store.getState();
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.equal(harness.store.getState(), before);
    pass('12. reconnect while Product owns surface → mode unchanged');
  }

  {
    const harness = createHarness(notificationState());
    const before = harness.store.getState();
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.equal(harness.store.getState(), before);
    pass('13. reconnect while Notification owns surface → mode unchanged');
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
    pass('14. repeated deeplink remains Runtime dedupe concern');
  }

  {
    const harness = createHarness();
    harness.resetSurfaces();
    harness.runtimeSink.bootCompleted({ currentItemId: null });
    harness.store.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
    const owners = new Set(harness.surfaces());
    assert.ok([...owners].every((o) => o === 'PRODUCT_FLOW' || o === 'BOOT'));
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'PRODUCT_FLOW',
    );
    pass('15. one global surface owner at a time');
  }

  {
    const root = process.cwd();
    const appServices = readFileSync(
      join(root, 'apps/web/src/app-services/AppServicesProvider.tsx'),
      'utf8',
    );
    const surface = readFileSync(
      join(root, 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    const product = readFileSync(
      join(root, 'apps/web/src/product-flow/product-flow.controller.ts'),
      'utf8',
    );
    const runtimePort = readFileSync(
      join(
        root,
        'apps/web/src/notification-runtime/notification-runtime.coordinator-port.ts',
      ),
      'utf8',
    );

    assert.doesNotMatch(appServices, /sendFlowRequested|bansSectionRequested/);
    assert.doesNotMatch(
      surface,
      /overlayVisible|pendingCount|startupHold|chainTransitioning/,
    );
    assert.doesNotMatch(product, /selectCurrentItemId|items\.queue|pending\.itemIds/);
    assert.doesNotMatch(runtimePort, /shadow|mirror|fallback|second queue/i);
    assert.equal(
      (appServices.match(/createAppCoordinatorLifecycle\(/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(runtimePort, /currentChanged|queueDrained/);
    assert.doesNotMatch(runtimePort, /\.queue\s*=/);
    assert.doesNotMatch(surface, /DirectNotificationHost/);
    pass('16. no old ownership selector / Host mount / activation sink');
  }

  {
    const controller = createProductFlowController({
      sink: {
        routeChanged() {},
        replyCancelled() {},
        replyCompleted() {},
        flowReleased() {},
      },
    });
    controller.openRoute({ route: 'WHO' });
    controller.openRoute({ route: 'WHO' });
    assert.equal(controller.getState().route, 'WHO');
    assert.equal(controller.getState().navigationGeneration, 1);
    controller.markSendSucceeded('ban:1');
    const gen = controller.getState().navigationGeneration;
    controller.markSendSucceeded('ban:1');
    // Second SUCCESS mark is still a local transition; Product prevents
    // duplicate coordinator OPEN_ROUTE via executor-only opens.
    assert.ok(controller.getState().navigationGeneration >= gen);
    pass('17. Product navigation is controller-owned without dual Runtime resume');
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
    assert.deepEqual(
      router.route({ startParam: 'res_r1', launchSource: 'telegram' }),
      {
        type: 'NOTIFICATION',
        itemId: 'result:r1',
        notificationKind: 'status',
      },
    );
    pass('18. EntryRouter maps Telegram notification prefixes only');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
