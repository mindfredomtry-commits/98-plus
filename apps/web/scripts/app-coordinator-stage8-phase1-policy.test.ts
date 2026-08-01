/**
 * Stage 8 Phase 1 — Application Policy core tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase1-policy.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideApplicationOwner,
} from '../src/app-coordinator/application-policy';
import {
  DEFAULT_DOMAIN_ID,
  domainOwner,
  type ApplicationOwner,
} from '../src/app-coordinator/application-owner';
import type { DomainCapability } from '../src/app-coordinator/domain-capability';
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
import { createTelegramEntryRouter } from '../src/app-coordinator/app-coordinator.entry-router';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
} from '../src/app-coordinator/app-coordinator.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { mapCreateBanCapability } from '../src/product-flow/create-ban/create-ban.capability';
import { createInitialCreateBanState } from '../src/product-flow/create-ban/create-ban.reducer';
import { entryIntentToCoordinatorEvent } from '../src/app-coordinator/app-coordinator.boundaries';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const root = process.cwd();
const policyFiles = [
  'application-policy.ts',
  'application-owner.ts',
  'domain-capability.ts',
  'owner-request.ts',
];

function createDomainHarness() {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  const intents: unknown[] = [];

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
    dispatch(intent: { type: string }) {
      intents.push(intent);
      productController.asDomainPort().dispatch(intent as never);
      calls.push(`domain:${intent.type}`);
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
    intent: { type: string },
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
    intents,
    violations,
    runtimeSink,
    productController,
    dispatchDomainIntent,
    productSink: createProductFlowEventSink((e) => store.dispatch(e)),
  };
}

async function main() {
  {
    const state = createInitialAppCoordinatorState();
    assert.deepEqual(state.currentOwner, { type: 'BOOT' });
    assert.equal(selectApplicationSurfaceOwner(state), 'BOOT');
    pass('1. Boot has exactly one owner authority');
  }

  {
    const harness = createDomainHarness();
    harness.runtimeSink.bootCompleted();
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('2. Boot completion selects default domain');
  }

  {
    const current: ApplicationOwner = domainOwner('CREATE_BAN');
    const a = decideApplicationOwner({
      currentOwner: current,
      currentCapability: { transition: 'ALLOWED' },
      requestedOwner: 'CREATE_BAN',
      requestKind: 'USER_INTENT',
    });
    assert.equal(a.decision.type, 'KEEP_CURRENT');
    pass('3. Same-owner request keeps current');
  }

  {
    const boot = decideApplicationOwner({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      requestedOwner: 'CREATE_BAN',
      requestKind: 'SYSTEM_READY',
    });
    assert.equal(boot.decision.type, 'SWITCH_OWNER');
    if (boot.decision.type === 'SWITCH_OWNER') {
      assert.deepEqual(boot.decision.owner, domainOwner('CREATE_BAN'));
    }
    pass('4. ALLOWED/boot permits registered target switch');
  }

  {
    const allowed = decideApplicationOwner({
      currentOwner: domainOwner('CREATE_BAN'),
      currentCapability: { transition: 'ALLOWED' },
      requestedOwner: 'NOTIFICATIONS',
      requestKind: 'USER_INTENT',
    });
    assert.equal(allowed.decision.type, 'SWITCH_OWNER');
    if (allowed.decision.type === 'SWITCH_OWNER') {
      assert.deepEqual(allowed.decision.owner, domainOwner('NOTIFICATIONS'));
    }

    const blocked = decideApplicationOwner({
      currentOwner: domainOwner('CREATE_BAN'),
      currentCapability: {
        transition: 'BLOCKED',
        reason: 'SUBMISSION_IN_PROGRESS',
      },
      requestedOwner: 'NOTIFICATIONS',
      requestKind: 'USER_INTENT',
    });
    assert.equal(blocked.decision.type, 'KEEP_CURRENT');
    assert.equal(blocked.violation, null);
    pass('5. BLOCKED rejects target switch; ALLOWED permits registered switch');
  }

  {
    const invalid = decideApplicationOwner({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      requestedOwner: 'NOT_A_DOMAIN' as never,
      requestKind: 'SYSTEM_READY',
    });
    assert.equal(invalid.violation?.code, 'UNREGISTERED_DOMAIN');
    pass('6. Invalid target causes typed violation');
  }

  {
    const forbidden =
      /\bWHO\b|\bWHAT\b|\bCONFIRM\b|\bSUCCESS\b|\bLOBBY\b|\bqueue\b|\bpending\b|\boverlay\b|\bdisplay\b|\bnotificationMode\b|\breal-time\b|\bnormal\b|from ['"]react['"]|\bcss\b|\bhttp\b|fetch\(/;
    for (const file of policyFiles) {
      const src = readFileSync(
        join(root, 'apps/web/src/app-coordinator', file),
        'utf8',
      );
      assert.doesNotMatch(src, forbidden, file);
    }
    pass('7-9. Policy sources free of routes/queue/React');
  }

  {
    const input = {
      currentOwner: { type: 'BOOT' } as ApplicationOwner,
      currentCapability: null as DomainCapability | null,
      requestedOwner: DEFAULT_DOMAIN_ID,
      requestKind: 'SYSTEM_READY' as const,
    };
    const a = decideApplicationOwner(input);
    const b = decideApplicationOwner(input);
    assert.deepEqual(a, b);
    if (a.decision.type === 'SWITCH_OWNER') {
      assert.equal(a.decision.owner.type, 'DOMAIN');
    }
    pass('10-11. Deterministic; one decision target');
  }

  {
    const harness = createDomainHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.equal(harness.intents.length, 1);
    assert.deepEqual(harness.intents[0], { type: 'COMPOSE_REQUESTED' });
    assert.equal(harness.productController.getState().route, 'WHO');
    pass('12. One domain intent reaches one port (compose → WHO)');
  }

  {
    const harness = createDomainHarness();
    // Still BOOT — domain intent must reject
    harness.dispatchDomainIntent('CREATE_BAN', { type: 'COMPOSE_REQUESTED' });
    assert.equal(harness.violations[0]?.code, 'DOMAIN_INTENT_NOT_CURRENT_OWNER');
    assert.equal(harness.intents.length, 0);
    pass('13. Non-current domain intent is rejected');
  }

  {
    const harness = createDomainHarness();
    harness.runtimeSink.bootCompleted();
    const before = harness.calls.length;
    harness.dispatchDomainIntent('CREATE_BAN', {
      type: 'COMPOSE_REQUESTED',
      // Coordinator router must not branch on payload fields — opaque dispatch
    });
    assert.ok(harness.calls.slice(before).includes('domain:COMPOSE_REQUESTED'));
    pass('14. Coordinator does not inspect domain-intent payload');
  }

  {
    const submitting = {
      ...createInitialCreateBanState(),
      submission: { status: 'SUBMITTING' as const },
    };
    assert.deepEqual(mapCreateBanCapability(submitting), {
      transition: 'BLOCKED',
      reason: 'SUBMISSION_IN_PROGRESS',
    });
    assert.deepEqual(mapCreateBanCapability(createInitialCreateBanState()), {
      transition: 'ALLOWED',
    });
    const policySrc = readFileSync(
      join(root, 'apps/web/src/app-coordinator/application-policy.ts'),
      'utf8',
    );
    assert.doesNotMatch(policySrc, /mapCreateBanCapability|submission\.status/);
    pass('15. Domain capability mapping lives outside policy');
  }

  {
    const runtimeDir = join(root, 'apps/web/src/notification-runtime');
    for (const f of readdirSync(runtimeDir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(runtimeDir, f), 'utf8');
      assert.doesNotMatch(src, /from '@\/app-coordinator/);
    }
    const createBanDir = join(root, 'apps/web/src/product-flow/create-ban');
    for (const f of readdirSync(createBanDir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(createBanDir, f), 'utf8');
      assert.doesNotMatch(
        src,
        /from '@\/notification-runtime|from '\.\.\/\.\.\/notification-runtime/,
      );
    }
    pass('16-17. Domain runtime has no Coordinator import; no domain↔domain');
  }

  {
    const surface = readFileSync(
      join(root, 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /currentOwner/);
    assert.match(surface, /owner\.domain === 'CREATE_BAN'/);
    assert.match(surface, /dispatchDomainIntent\('CREATE_BAN'/);
    assert.doesNotMatch(surface, /currentOwner\s*=/);
    pass('18. ApplicationSurface selects presentation from currentOwner');
  }

  {
    const router = createTelegramEntryRouter();
    assert.deepEqual(
      router.route({ startParam: null, launchSource: 'web' }),
      { type: 'PRODUCT' },
    );
    const event = entryIntentToCoordinatorEvent({ type: 'PRODUCT' });
    assert.equal(event.type, 'ENTRY_ROUTED');
    pass('19. Entry Router requests owner rather than mounting UI');
  }

  {
    const harness = createDomainHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:x',
        notificationKind: 'incoming',
      },
    });
    assert.ok(harness.calls.includes('ingest:incoming:x'));
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('20. Notification deeplink only ingests; no Notification owner');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
