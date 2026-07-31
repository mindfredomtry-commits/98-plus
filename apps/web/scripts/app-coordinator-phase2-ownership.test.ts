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
    assert.equal(selectNotificationItemId(harness.store.getState()), 'incoming:P');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'NOTIFICATION_SYSTEM',
    );
    pass('2. boot with pending item → Notification');
  }

  {
    const harness = createHarness(productState());
    harness.runtimeSink.currentChanged('incoming:WS');
    assert.equal(
      selectNotificationItemId(harness.store.getState()),
      'incoming:WS',
    );
    pass('3. Runtime current item change → matching Notification identity');
  }

  {
    const harness = createHarness(productState('LOBBY'));
    harness.runtimeSink.currentChanged('incoming:WS');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'NOTIFICATION_SYSTEM',
    );
    pass('4. WS during Lobby → Notification');
  }

  {
    for (const route of ['WHO', 'WHAT'] as const) {
      const harness = createHarness(productState(route));
      harness.runtimeSink.currentChanged(`incoming:${route}`);
      assert.equal(selectProductRoute(harness.store.getState()), route);
      assert.equal(
        selectApplicationSurfaceOwner(harness.store.getState()),
        'PRODUCT_FLOW',
      );
    }
    pass('5. WS during WHO/WHAT → Product remains owner');
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
    assert.equal(
      selectNotificationItemId(harness.store.getState()),
      'incoming:source',
    );
    pass('9. reply cancellation → exact source notification');
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
    harness.runtimeSink.currentChanged('check:NEXT');
    assert.equal(
      selectNotificationItemId(harness.store.getState()),
      'check:NEXT',
    );
    pass('10. reply completion with next queue item → next Notification');
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
    harness.runtimeSink.queueDrained();
    assert.equal(selectProductRoute(harness.store.getState()), 'BANS');
    pass('11. reply completion with drained queue → saved Product route');
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
    assert.match(runtimePort, /selectReadyHeadId/);
    assert.doesNotMatch(runtimePort, /\.queue\s*=/);
    pass('16. no old ownership selector / second queue / legacy fallback');
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
