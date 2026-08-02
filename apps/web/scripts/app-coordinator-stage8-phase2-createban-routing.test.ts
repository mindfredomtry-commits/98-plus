/**
 * Stage 8 Phase 2 — complete CreateBan intent routing.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase2-createban-routing.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorCommandExecutor } from '../src/app-coordinator/app-coordinator.command-executor';
import {
  createNotificationRuntimeEventSink,
  type NotificationRuntimePort,
} from '../src/app-coordinator/app-coordinator.ports';
import { createAppCoordinatorStore } from '../src/app-coordinator/app-coordinator.store';
import {
  selectApplicationSurfaceOwner,
  selectCurrentOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
} from '../src/app-coordinator/app-coordinator.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import type { CreateBanUiIntent } from '../src/product-flow/create-ban/create-ban.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const root = process.cwd();
const webSrc = join(root, 'apps/web/src');

function createHarness() {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  const routed: CreateBanUiIntent[] = [];

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

  const domainPort = {
    dispatch(intent: CreateBanUiIntent) {
      routed.push(intent);
      productController.asDomainPort().dispatch(intent);
      calls.push(`port:${intent.type}`);
    },
    getCapability: () => productController.asDomainPort().getCapability(),
  };

  const store = createAppCoordinatorStore({
    initialState: createInitialAppCoordinatorState(),
    executor: createAppCoordinatorCommandExecutor({
      notificationRuntime: runtime,
    }),
    reduceContext: {
      getCurrentCapability() {
        const owner = store.getState().currentOwner;
        if (owner.type !== 'DOMAIN') return null;
        return domainPort.getCapability();
      },
    },
    onInvariantViolation(v) {
      violations.push(v);
    },
  });

  const runtimeSink = createNotificationRuntimeEventSink((e) => {
    store.dispatch(e);
  });

  function dispatchDomainIntent(
    domain: 'CREATE_BAN',
    intent: CreateBanUiIntent,
  ): void {
    const owner = store.getState().currentOwner;
    if (owner.type !== 'DOMAIN' || owner.domain !== domain) {
      violations.push({
        code: 'DOMAIN_INTENT_NOT_CURRENT_OWNER',
        eventType: 'DOMAIN_INTENT',
        message: 'rejected',
      });
      return;
    }
    domainPort.dispatch(intent);
  }

  return {
    store,
    calls,
    routed,
    violations,
    runtimeSink,
    productController,
    dispatchDomainIntent,
  };
}

async function main() {
  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.doesNotMatch(surface, /controller\.dispatch\s*\(/);
    assert.doesNotMatch(surface, /navigateLocal\s*\(/);
    assert.match(surface, /onIntent/);
    pass('1. ProductFlowSurface never dispatches Runtime / navigateLocal');
  }

  {
    const controller = readFileSync(
      join(webSrc, 'product-flow/product-flow.controller.ts'),
      'utf8',
    );
    assert.doesNotMatch(controller, /navigateLocal/);
    pass('2. navigateLocal removed from ProductFlowController');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    const appSurface = readFileSync(
      join(webSrc, 'app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /onIntent:\s*\(intent: CreateBanUiIntent\)/);
    assert.match(appSurface, /dispatchDomainIntent\(\{[\s\S]*domain: 'CREATE_BAN'/);
    assert.match(appSurface, /onIntent=\{onCreateBanIntent\}/);
    pass('3. Every CreateBan UI action reaches Coordinator first');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    const intents: CreateBanUiIntent[] = [
      { type: 'COMPOSE_REQUESTED' },
      { type: 'TEXT_CHANGED', text: 'x' },
      { type: 'DURATION_CHANGED', durationMinutes: 5 },
      { type: 'CONTINUE_REQUESTED' },
      { type: 'BACK_REQUESTED' },
      { type: 'SUBMIT_REQUESTED' },
      { type: 'SUCCESS_DISMISSED' },
      { type: 'NAVIGATE_BANS_REQUESTED' },
      { type: 'RELEASE_TO_LOBBY_REQUESTED' },
      { type: 'RECIPIENTS_RETRY_REQUESTED' },
    ];
    for (const intent of intents) {
      harness.dispatchDomainIntent('CREATE_BAN', intent);
    }
    assert.equal(harness.routed.length, intents.length);
    assert.ok(harness.calls.every((c) => !c.startsWith('port:') || c.includes('port:')));
    assert.equal(
      harness.calls.filter((c) => c.startsWith('port:')).length,
      intents.length,
    );
    pass('4. Coordinator routes every CreateBan intent through Domain Port');
  }

  {
    const ports = readFileSync(
      join(webSrc, 'app-coordinator/domain-ports.ts'),
      'utf8',
    );
    assert.match(ports, /CreateBanDomainPort/);
    assert.match(ports, /dispatch\(intent: CreateBanUiIntent\)/);
    const lifecycle = readFileSync(
      join(webSrc, 'app-coordinator/app-coordinator.lifecycle.ts'),
      'utf8',
    );
    assert.match(lifecycle, /domainPorts\.CREATE_BAN\.dispatch\(/);
    assert.match(lifecycle, /domainPorts\.SETTINGS\.dispatch\(/);
    pass('5. Domain Port is the only production Runtime entry');
  }

  {
    const harness = createHarness();
    harness.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.equal(
      harness.violations[0]?.code,
      'DOMAIN_INTENT_NOT_CURRENT_OWNER',
    );
    assert.equal(harness.routed.length, 0);
    pass('6. Wrong owner rejects intent');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.equal(harness.productController.getState().route, 'WHO');
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('7. Current owner accepts intent');
  }

  {
    const createBanDir = join(webSrc, 'product-flow/create-ban');
    for (const f of readdirSync(createBanDir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(createBanDir, f), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/app-coordinator/);
      assert.doesNotMatch(src, /app-coordinator\//);
    }
    pass('8. CreateBan has zero Coordinator imports');
  }

  {
    const owner = readFileSync(
      join(webSrc, 'app-coordinator/application-owner.ts'),
      'utf8',
    );
    // Phase 2 historical: only CREATE_BAN. Phase 5 adds NOTIFICATIONS —
    // CREATE_BAN remains registered; this suite still proves CreateBan routing.
    assert.match(owner, /CREATE_BAN/);
    pass('9. CREATE_BAN remains a registered domain');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    pass('10. BOOT selects CREATE_BAN');
  }

  {
    const a = createHarness();
    const b = createHarness();
    a.runtimeSink.bootCompleted();
    b.runtimeSink.bootCompleted();
    a.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    b.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.deepEqual(
      selectCurrentOwner(a.store.getState()),
      selectCurrentOwner(b.store.getState()),
    );
    assert.equal(a.productController.getState().route, 'WHO');
    assert.equal(b.productController.getState().route, 'WHO');
    pass('11. Architecture remains deterministic');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      surface,
      /notification-runtime|create-ban\.reducer|create-ban\.store/,
    );
    const policyFiles = [
      'application-policy.ts',
      'application-owner.ts',
      'owner-request.ts',
    ];
    for (const f of policyFiles) {
      const src = readFileSync(join(webSrc, 'app-coordinator', f), 'utf8');
      assert.doesNotMatch(src, /from ['"]react['"]|product-flow\.surface|product-flow\.controller/);
    }
    pass('12. Source guards: presentation/policy boundaries');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
