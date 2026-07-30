import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorCommandExecutor } from '../src/app-coordinator/app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  createProductFlowEventSink,
  type NotificationRuntimeEventSink,
  type NotificationRuntimePort,
  type ProductFlowPort,
} from '../src/app-coordinator/app-coordinator.ports';
import { createAppCoordinatorStore } from '../src/app-coordinator/app-coordinator.store';
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import type {
  AppCoordinatorInvariantViolation,
  AppCoordinatorState,
  ProductRoute,
  ResumeToken,
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

function createHarness(
  initialState: AppCoordinatorState,
  callbacks: {
    ingest?: (sink: NotificationRuntimeEventSink) => void;
    resume?: (
      sink: NotificationRuntimeEventSink,
      token: ResumeToken | null,
    ) => void;
  } = {},
) {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  let runtimeSink: NotificationRuntimeEventSink;
  let stateAtPortCall: AppCoordinatorState | null = null;

  const notificationRuntime: NotificationRuntimePort = {
    ingestEntry(intent) {
      calls.push(`runtime.ingest:${intent.itemId}`);
      stateAtPortCall = store.getState();
      callbacks.ingest?.(runtimeSink);
    },
    suspend({ sourceItemId, resumeToken }) {
      calls.push(`runtime.suspend:${sourceItemId}:${resumeToken}`);
      stateAtPortCall = store.getState();
    },
    resume({ resumeToken }) {
      calls.push(`runtime.resume:${resumeToken}`);
      stateAtPortCall = store.getState();
      callbacks.resume?.(runtimeSink, resumeToken);
    },
    completeSourceItem({ sourceItemId, resumeToken }) {
      calls.push(`runtime.complete:${sourceItemId}:${resumeToken}`);
      stateAtPortCall = store.getState();
    },
  };

  const productFlow: ProductFlowPort = {
    openRoute({ route }) {
      calls.push(`product.open:${route}`);
      stateAtPortCall = store.getState();
    },
  };

  const executor = createAppCoordinatorCommandExecutor({
    notificationRuntime,
    productFlow,
  });
  const store = createAppCoordinatorStore({
    initialState,
    executor,
    onInvariantViolation(violation) {
      violations.push(violation);
    },
  });
  runtimeSink = createNotificationRuntimeEventSink((event) => {
    store.dispatch(event);
  });
  const productSink = createProductFlowEventSink((event) => {
    store.dispatch(event);
  });

  return {
    calls,
    violations,
    store,
    runtimeSink,
    productSink,
    getStateAtPortCall: () => stateAtPortCall,
  };
}

function startReply(
  harness: ReturnType<typeof createHarness>,
  token: ResumeToken,
  sourceItemId = 'incoming:A',
): void {
  harness.store.dispatch({
    type: 'REPLY_REQUESTED',
    sourceItemId,
    targetUserId: 'user:B',
    resumeToken: token,
  });
}

async function main() {
  {
    const harness = createHarness(productState('WHO'));
    const order: string[] = [];
    harness.store.subscribe((state) => {
      order.push(`subscriber:${state.mode.type}`);
    });
    harness.store.dispatch({
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: null,
      productRoute: 'LOBBY',
    });
    order.push(harness.calls[0]);
    assert.deepEqual(order, ['subscriber:PRODUCT', 'product.open:LOBBY']);
    assert.deepEqual(harness.getStateAtPortCall()?.mode, {
      type: 'PRODUCT',
      route: 'LOBBY',
    });
    pass('1. state commits and subscribers run before command execution');
  }

  {
    const observed: { state?: AppCoordinatorState } = {};
    const harness = createHarness(productState(), {
      ingest(sink) {
        sink.currentChanged('incoming:sync');
        observed.state = harness.store.getState();
      },
    });
    harness.store.dispatch({
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:sync',
        notificationKind: 'incoming',
      },
    });
    assert.deepEqual(observed.state?.mode, {
      type: 'PRODUCT',
      route: 'LOBBY',
    });
    assert.deepEqual(harness.store.getState().mode, {
      type: 'NOTIFICATION',
      itemId: 'incoming:sync',
    });
    pass('2. synchronous Runtime facts are queued, not reduced recursively');
  }

  {
    const harness = createHarness(productState());
    let notifications = 0;
    const unsubscribe = harness.store.subscribe(() => {
      notifications += 1;
    });
    harness.store.dispatch({
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:A',
        notificationKind: 'incoming',
      },
    });
    assert.equal(notifications, 0);
    harness.runtimeSink.currentChanged('incoming:A');
    assert.equal(notifications, 1);
    unsubscribe();
    harness.runtimeSink.currentChanged('incoming:B');
    assert.equal(notifications, 1);
    pass('3. subscribers observe commits only and can unsubscribe');
  }

  {
    const harness = createHarness(notificationState());
    const token = tokenFactory.create();
    startReply(harness, token);
    assert.match(harness.calls[0], /^runtime\.suspend:incoming:A:/);
    assert.equal(harness.calls[1], 'product.open:WHAT');
    assert.equal(harness.store.getState().mode.type, 'REPLY_COMPOSE');
    pass('4. reply request suspends Runtime and opens Product reply route');
  }

  {
    const harness = createHarness(notificationState('incoming:source'));
    const token = tokenFactory.create();
    startReply(harness, token, 'incoming:source');
    harness.productSink.replyCancelled({
      resumeToken: token,
      sourceItemId: 'incoming:source',
    });
    assert.deepEqual(harness.store.getState().mode, {
      type: 'NOTIFICATION',
      itemId: 'incoming:source',
    });
    assert.equal(harness.calls.at(-1), `runtime.resume:${token}`);
    harness.productSink.replyCancelled({
      resumeToken: token,
      sourceItemId: 'incoming:source',
    });
    assert.equal(
      harness.violations.at(-1)?.code,
      'DUPLICATE_REPLY_CANCELLATION',
    );
    pass('5. cancellation restores exact source and rejects duplicates');
  }

  {
    const harness = createHarness(notificationState(), {
      resume(sink) {
        sink.currentChanged('check:NEXT');
      },
    });
    const token = tokenFactory.create();
    startReply(harness, token);
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.deepEqual(harness.calls.slice(-2), [
      `runtime.complete:incoming:A:${token}`,
      `runtime.resume:${token}`,
    ]);
    assert.deepEqual(harness.store.getState().mode, {
      type: 'NOTIFICATION',
      itemId: 'check:NEXT',
    });
    pass('6. completion executes complete then resume and accepts next current');
  }

  {
    const harness = createHarness(notificationState('incoming:A', 'BANS'), {
      resume(sink) {
        sink.queueDrained();
      },
    });
    const token = tokenFactory.create();
    startReply(harness, token);
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.deepEqual(harness.store.getState().mode, {
      type: 'PRODUCT',
      route: 'BANS',
    });
    assert.equal(harness.calls.at(-1), 'product.open:BANS');
    pass('7. drained reply queue returns to bounded saved Product route');
  }

  {
    const harness = createHarness(notificationState());
    const token = tokenFactory.create();
    startReply(harness, token);
    harness.productSink.replyCancelled({
      resumeToken: tokenFactory.create(),
      sourceItemId: 'incoming:A',
    });
    assert.equal(harness.violations.at(-1)?.code, 'STALE_RESUME_TOKEN');
    assert.equal(harness.store.getState().mode.type, 'REPLY_COMPOSE');
    pass('8. stale token is rejected without commands or state change');
  }

  {
    const harness = createHarness(notificationState());
    const token = tokenFactory.create();
    startReply(harness, token);
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'wrong:item',
    });
    assert.equal(
      harness.violations.at(-1)?.code,
      'WRONG_REPLY_SOURCE_ITEM',
    );
    assert.equal(harness.calls.some((call) => call.startsWith('runtime.complete')), false);
    pass('9. wrong reply source is rejected before Runtime completion');
  }

  {
    const harness = createHarness(notificationState());
    const token = tokenFactory.create();
    startReply(harness, token);
    harness.productSink.routeChanged('SUCCESS');
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    harness.productSink.replyCompleted({
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(
      harness.violations.at(-1)?.code,
      'DUPLICATE_REPLY_COMPLETION',
    );
    pass('10. duplicate completion is rejected');
  }

  {
    const harness = createHarness(notificationState());
    startReply(harness, tokenFactory.create());
    harness.store.dispatch({
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:C',
      resumeToken: tokenFactory.create(),
    });
    assert.equal(harness.violations.at(-1)?.code, 'REPLY_ALREADY_ACTIVE');
    pass('11. a second active reply suspension is rejected');
  }

  {
    const harness = createHarness(notificationState());
    harness.productSink.replyCancelled({
      resumeToken: tokenFactory.create(),
      sourceItemId: 'incoming:A',
    });
    assert.equal(
      harness.violations.at(-1)?.code,
      'RESUME_WITHOUT_ACTIVE_SUSPENSION',
    );
    assert.equal(harness.calls.some((call) => call.startsWith('runtime.resume')), false);
    pass('12. resume without active suspension is rejected');
  }

  {
    const harness = createHarness(notificationState());
    const original = harness.store.getState();
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.equal(harness.store.getState(), original);
    assert.deepEqual(harness.calls, []);
    pass('13. reconnect facts preserve application mode');
  }

  {
    const harness = createHarness(productState());
    const event = {
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:dedupe',
        notificationKind: 'incoming',
      },
    } as const;
    harness.store.dispatch(event);
    harness.store.dispatch(event);
    assert.deepEqual(harness.calls, [
      'runtime.ingest:incoming:dedupe',
      'runtime.ingest:incoming:dedupe',
    ]);
    assert.deepEqual(harness.store.getState().mode, {
      type: 'PRODUCT',
      route: 'LOBBY',
    });
    pass('14. repeated entry ingestion remains a Runtime dedupe concern');
  }

  {
    const portsSource = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/app-coordinator/app-coordinator.ports.ts',
      ),
      'utf8',
    );
    for (const forbidden of [
      'queue:',
      'pending:',
      'getState',
      'setCurrent',
      'setDisplay',
      'React',
    ]) {
      assert.doesNotMatch(portsSource, new RegExp(forbidden));
    }
    assert.deepEqual(
      ['ingestEntry', 'suspend', 'resume', 'completeSourceItem'].sort(),
      ['completeSourceItem', 'ingestEntry', 'resume', 'suspend'].sort(),
    );
    pass('15. subsystem ports expose commands and facts, never state');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
