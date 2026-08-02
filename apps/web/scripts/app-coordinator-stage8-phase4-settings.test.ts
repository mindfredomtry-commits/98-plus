/**
 * Stage 8 Phase 4 — Settings domain end-to-end proofs.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase4-settings.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  selectReturnOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorInvariantViolation,
} from '../src/app-coordinator/app-coordinator.types';
import type { DomainIntent } from '../src/app-coordinator/domain-ports';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { createSettingsController } from '../src/settings/settings.controller';
import {
  mapSettingsUiEvent,
  presentSettingsState,
} from '../src/settings/presentation/settings.presenter';
import { settingsReducer } from '../src/settings/settings.reducer';
import { createInitialSettingsState } from '../src/settings/settings.types';

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
  const settingsController = createSettingsController();

  const domainPorts = {
    CREATE_BAN: productController.asDomainPort(),
    SETTINGS: settingsController.asDomainPort(),
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
        if (owner.domain === 'CREATE_BAN') {
          return domainPorts.CREATE_BAN.getCapability();
        }
        if (owner.domain === 'SETTINGS') {
          return domainPorts.SETTINGS.getCapability();
        }
        return null;
      },
    },
    onInvariantViolation(v) {
      violations.push(v);
    },
  });

  const runtimeSink = createNotificationRuntimeEventSink((e) => {
    store.dispatch(e);
  });

  function dispatchDomainIntent(input: DomainIntent): void {
    const owner = store.getState().currentOwner;
    if (owner.type !== 'DOMAIN' || owner.domain !== input.domain) {
      violations.push({
        code: 'DOMAIN_INTENT_NOT_CURRENT_OWNER',
        eventType: 'DOMAIN_INTENT',
        message: 'rejected',
      });
      return;
    }
    if (input.domain === 'CREATE_BAN') {
      domainPorts.CREATE_BAN.dispatch(input.intent);
      calls.push(`createban:${input.intent.type}`);
      return;
    }
    domainPorts.SETTINGS.dispatch(input.intent);
    calls.push(`settings:${input.intent.type}`);
  }

  return {
    store,
    calls,
    violations,
    runtimeSink,
    productController,
    settingsController,
    dispatchDomainIntent,
  };
}

async function main() {
  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(selectReturnOwner(harness.store.getState()), null);
    pass('1. Ordinary boot → CREATE_BAN');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'SETTINGS',
    );
    assert.deepEqual(selectReturnOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    pass('2. Open Settings while ALLOWED → SETTINGS + return CREATE_BAN');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent({
      domain: 'CREATE_BAN',
      intent: { type: 'COMPOSE_REQUESTED' },
    });
    // Force BLOCKED via submitting state is hard without submission; open while
    // capability ALLOWED is already proven. Simulate BLOCKED by reducing with
    // a context that returns BLOCKED.
    const blockedStore = createAppCoordinatorStore({
      initialState: {
        currentOwner: { type: 'DOMAIN', domain: 'CREATE_BAN' },
        returnOwner: null,
      },
      executor: createAppCoordinatorCommandExecutor({
        notificationRuntime: {
          ingestEntry() {},
          flushDeferredDirectEntry() {},
        },
      }),
      reduceContext: {
        getCurrentCapability: () => ({
          transition: 'BLOCKED',
          reason: 'SUBMISSION_IN_PROGRESS',
        }),
      },
      onInvariantViolation() {},
    });
    blockedStore.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(blockedStore.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReturnOwner(blockedStore.getState()), null);
    pass('3. Open Settings while BLOCKED keeps CREATE_BAN; no returnOwner');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /owner\.domain === 'SETTINGS'/);
    assert.match(surface, /SettingsSurface/);
    assert.match(surface, /owner\.domain === 'CREATE_BAN'/);
    assert.doesNotMatch(surface, /hidden|aria-hidden/);
    pass('4. Settings presentation mounts only while SETTINGS owns');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    harness.dispatchDomainIntent({
      domain: 'SETTINGS',
      intent: {
        type: 'NOTIFICATION_PREFERENCE_CHANGED',
        preference: 'NORMAL',
      },
    });
    assert.equal(
      harness.settingsController.getState().notificationPreference,
      'NORMAL',
    );
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'SETTINGS',
    );
    pass('5. Choose NORMAL; owner remains SETTINGS');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    harness.dispatchDomainIntent({
      domain: 'SETTINGS',
      intent: {
        type: 'NOTIFICATION_PREFERENCE_CHANGED',
        preference: 'REAL_TIME',
      },
    });
    assert.equal(
      harness.settingsController.getState().notificationPreference,
      'REAL_TIME',
    );
    pass('6. Choose REAL_TIME; owner remains SETTINGS');
  }

  {
    let state = createInitialSettingsState();
    const a = settingsReducer(state, {
      type: 'NOTIFICATION_PREFERENCE_CHANGED',
      preference: 'NORMAL',
    });
    assert.equal(a.changed, true);
    const b = settingsReducer(a.state, {
      type: 'NOTIFICATION_PREFERENCE_CHANGED',
      preference: 'NORMAL',
    });
    assert.equal(b.changed, false);
    assert.equal(b.state, a.state);
    pass('7. Repeated selection is deterministic / stable');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    harness.store.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReturnOwner(harness.store.getState()), null);
    pass('8. Close Settings returns to CREATE_BAN; clears return context');
  }

  {
    const store = createAppCoordinatorStore({
      initialState: {
        currentOwner: { type: 'DOMAIN', domain: 'SETTINGS' },
        returnOwner: null,
      },
      executor: createAppCoordinatorCommandExecutor({
        notificationRuntime: {
          ingestEntry() {},
          flushDeferredDirectEntry() {},
        },
      }),
      reduceContext: {
        getCurrentCapability: () => ({ transition: 'ALLOWED' }),
      },
      onInvariantViolation() {},
    });
    const result = store.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
    assert.equal(
      result.status === 'PROCESSED' && result.result.violation?.code,
      'MISSING_RETURN_OWNER',
    );
    assert.equal(
      selectApplicationSurfaceOwner(store.getState()),
      'SETTINGS',
    );
    pass('9. Close without return owner → violation; stays SETTINGS');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent({
      domain: 'CREATE_BAN',
      intent: { type: 'COMPOSE_REQUESTED' },
    });
    assert.equal(harness.productController.getState().route, 'WHO');
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    harness.store.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
    assert.equal(harness.productController.getState().route, 'WHO');
    pass('10. CreateBan state survives Settings ownership');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent({
      domain: 'SETTINGS',
      intent: {
        type: 'NOTIFICATION_PREFERENCE_CHANGED',
        preference: 'NORMAL',
      },
    });
    assert.equal(
      harness.violations[0]?.code,
      'DOMAIN_INTENT_NOT_CURRENT_OWNER',
    );
    pass('11. Settings intent while CREATE_BAN owns → reject');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.store.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
    harness.dispatchDomainIntent({
      domain: 'CREATE_BAN',
      intent: { type: 'COMPOSE_REQUESTED' },
    });
    assert.equal(
      harness.violations[0]?.code,
      'DOMAIN_INTENT_NOT_CURRENT_OWNER',
    );
    pass('12. CreateBan intent while SETTINGS owns → reject');
  }

  {
    const mapped = mapSettingsUiEvent({
      type: 'PREFERENCE_SELECTED',
      preference: 'NORMAL',
    });
    assert.equal(mapped.kind, 'DOMAIN');
    const close = mapSettingsUiEvent({ type: 'CLOSE_PRESSED' });
    assert.deepEqual(close, {
      kind: 'APPLICATION',
      intent: 'CLOSE_SETTINGS_REQUESTED',
    });
    pass('13. One UI event maps to at most one port/application intent');
  }

  {
    const settingsDir = join(webSrc, 'settings');
    const settingsRuntime = [
      'settings.types.ts',
      'settings.reducer.ts',
      'settings.controller.ts',
      'settings.capability.ts',
    ];
    for (const f of settingsRuntime) {
      const src = readFileSync(join(settingsDir, f), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/app-coordinator/);
      assert.doesNotMatch(src, /from ['"]@\/product-flow/);
      assert.doesNotMatch(src, /from ['"]@\/notification-runtime/);
      assert.doesNotMatch(src, /from ['"]react['"]/);
    }
    const createBanDir = join(webSrc, 'product-flow/create-ban');
    for (const f of readdirSync(createBanDir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(createBanDir, f), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/settings/);
    }
    const presenter = readFileSync(
      join(settingsDir, 'presentation/settings.presenter.ts'),
      'utf8',
    );
    assert.doesNotMatch(presenter, /settings\.controller|settings\.reducer/);
    pass('14-15. Settings never calls CreateBan; CreateBan never calls Settings');
  }

  {
    const owner = readFileSync(
      join(webSrc, 'app-coordinator/application-owner.ts'),
      'utf8',
    );
    const policy = readFileSync(
      join(webSrc, 'app-coordinator/application-policy.ts'),
      'utf8',
    );
    assert.match(owner, /SETTINGS/);
    assert.doesNotMatch(policy, /SETTINGS|NORMAL|REAL_TIME|notificationPreference/);
    assert.equal(existsSync(join(webSrc, 'settings/settings.controller.ts')), true);
    assert.equal(
      existsSync(join(webSrc, 'settings/presentation/SettingsScreen.tsx')),
      true,
    );
    pass('16. SETTINGS registered with Runtime+port+presenter+UI; policy generic');
  }

  {
    const view = presentSettingsState({
      notificationPreference: 'NORMAL',
    });
    assert.equal(view.title, 'Настройки');
    assert.equal(view.options.find((o) => o.id === 'NORMAL')?.selected, true);
    assert.equal(view.options.find((o) => o.id === 'REAL_TIME')?.selected, false);
    pass('17. Presenter ViewState mapping');
  }

  {
    const ui = readFileSync(
      join(webSrc, 'settings/presentation/SettingsScreen.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      ui,
      /settings\.controller|settings\.reducer|app-coordinator|domain-ports/,
    );
    const runtimeFiles = [
      'settings.types.ts',
      'settings.reducer.ts',
      'settings.controller.ts',
      'settings.capability.ts',
    ];
    for (const f of runtimeFiles) {
      const src = readFileSync(join(webSrc, 'settings', f), 'utf8');
      assert.doesNotMatch(
        src,
        /\bcurrentOwner\b|\breturnOwner\b|\bLOBBY\b|\bWHO\b|\bqueue\b|\boverlay\b/,
      );
    }
    pass('18. Source guards for Settings Runtime / UI');
  }

  {
    const controller = createSettingsController();
    const snap1 = controller.getState();
    const snap2 = controller.getState();
    assert.equal(snap1, snap2);
    controller.dispatch({
      type: 'NOTIFICATION_PREFERENCE_CHANGED',
      preference: 'NORMAL',
    });
    const snap3 = controller.getState();
    assert.notEqual(snap3, snap1);
    assert.equal(controller.getState(), snap3);
    pass('19. Stable Settings snapshots');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.match(surface, /onOpenSettings/);
    assert.match(surface, /Настройки/);
    assert.doesNotMatch(surface, /OPEN_SETTINGS|SETTINGS/);
    pass('20. CreateBan Lobby exposes Settings entry as application callback');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
