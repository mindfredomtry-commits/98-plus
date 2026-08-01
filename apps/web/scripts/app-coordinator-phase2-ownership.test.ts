/**
 * App Coordinator Phase 2 — ownership after Stage 8 Phase 1 (currentOwner).
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
} from '../src/app-coordinator/app-coordinator.ports';
import { createAppCoordinatorStore } from '../src/app-coordinator/app-coordinator.store';
import { selectApplicationSurfaceOwner } from '../src/app-coordinator/app-coordinator.selectors';
import { createTelegramEntryRouter } from '../src/app-coordinator/app-coordinator.entry-router';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
  type AppCoordinatorState,
} from '../src/app-coordinator/app-coordinator.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { entryIntentToCoordinatorEvent } from '../src/app-coordinator/app-coordinator.boundaries';

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function createBanOwner(): AppCoordinatorState {
  return {
    currentOwner: { type: 'DOMAIN', domain: 'CREATE_BAN' },
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
    }),
    reduceContext: {
      getCurrentCapability() {
        const owner = store.getState().currentOwner;
        if (owner.type !== 'DOMAIN') return null;
        return productController.asDomainPort().getCapability();
      },
    },
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

  function dispatchDomainIntent(
    domain: 'CREATE_BAN',
    intent: { type: string },
  ): void {
    const owner = store.getState().currentOwner;
    if (owner.type !== 'DOMAIN' || owner.domain !== domain) return;
    productController.asDomainPort().dispatch(intent as never);
    calls.push(`domain:${intent.type}`);
  }

  return {
    store,
    calls,
    violations,
    surfaces: () => surfaces,
    runtimeSink,
    productSink,
    productController,
    dispatchDomainIntent,
    resetSurfaces() {
      surfaces = [];
    },
  };
}

async function main() {
  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    pass('1. ordinary boot → CREATE_BAN domain');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    assert.equal(harness.store.getState().currentOwner.type, 'DOMAIN');
    pass('2. boot always → domain owner (no Notification mode)');
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
    assert.doesNotMatch(
      ports,
      /currentChanged|queueDrained|SUSPEND|COMPLETE_SOURCE/,
    );
    assert.doesNotMatch(types, /REPLY_COMPOSE/);
    assert.match(types, /currentOwner: ApplicationOwner/);
    pass('3. currentOwner authority; no activation sink APIs');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.runtimeSink.reconnectStarted();
    harness.runtimeSink.reconnectCompleted();
    assert.deepEqual(harness.store.getState().currentOwner, {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('4. reconnect leaves domain owner unchanged');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.equal(harness.productController.getState().route, 'WHO');
    assert.doesNotMatch(harness.calls.join(','), /suspend/);
    assert.match(harness.calls.join(','), /domain:COMPOSE_REQUESTED/);
    pass('5. Lobby compose → domain intent → WHO');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.productSink.flowReleased('LOBBY');
    assert.ok(harness.calls.includes('flush'));
    pass('6. Product release flushes deferred direct entry');
  }

  {
    const harness = createHarness(createBanOwner());
    harness.store.dispatch(
      entryIntentToCoordinatorEvent({
        type: 'NOTIFICATION',
        itemId: 'incoming:x',
        notificationKind: 'incoming',
      }),
    );
    assert.ok(harness.calls.includes('ingest:incoming:x'));
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    pass('7. deeplink ENTRY ingests only; owner stays CREATE_BAN');
  }

  {
    const owners = new Set(
      [createInitialAppCoordinatorState(), createBanOwner()].map((s) =>
        selectApplicationSurfaceOwner(s),
      ),
    );
    assert.ok([...owners].every((o) => o === 'CREATE_BAN' || o === 'BOOT'));
    pass('8. one global surface owner at a time (Boot|CREATE_BAN)');
  }

  {
    const surface = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    const runtimePort = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/app-coordinator/notification-runtime-port.ts',
      ),
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
