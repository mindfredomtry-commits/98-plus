/**
 * Stage 7 Phase 3 — Coordinator transitions (BOOT | PRODUCT only).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import {
  selectApplicationSurfaceOwner,
  selectProductRoute,
} from '../src/app-coordinator/app-coordinator.selectors';
import { APP_COORDINATOR_TRANSITION_MATRIX } from '../src/app-coordinator/app-coordinator.transition-matrix';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEvent,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function productState(route: ProductRoute): AppCoordinatorState {
  return {
    mode: { type: 'PRODUCT', route },
    resumeDestination: { type: 'PRODUCT', route },
  };
}

function dispatch(state: AppCoordinatorState, event: AppCoordinatorEvent) {
  return appCoordinatorReducer(state, event);
}

async function main() {
  assert.ok(APP_COORDINATOR_TRANSITION_MATRIX.length >= 4);

  {
    const result = dispatch(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(selectApplicationSurfaceOwner(result.state), 'PRODUCT_FLOW');
    pass('1. ordinary launch → PRODUCT(LOBBY)');
  }

  {
    let state = productState('LOBBY');
    const result = dispatch(state, {
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:deeplink',
        notificationKind: 'incoming',
      },
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(result.effects[0]?.target, 'NOTIFICATION_RUNTIME');
    pass('2. deeplink ENTRY ingests; mode stays Product');
  }

  {
    const result = dispatch(productState('LOBBY'), {
      type: 'PRODUCT_COMPOSE_REQUESTED',
    });
    assert.equal(selectProductRoute(result.state), 'WHO');
    pass('3. ordinary compose remains Product-owned');
  }

  {
    const result = dispatch(productState('CONFIRM'), {
      type: 'PRODUCT_FLOW_RELEASED',
      route: 'LOBBY',
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(
      result.effects.some(
        (e) =>
          e.target === 'NOTIFICATION_RUNTIME' &&
          e.command.type === 'FLUSH_DEFERRED_DIRECT_ENTRY',
      ),
      true,
    );
    pass('4. Product release flushes deferred direct entry');
  }

  {
    const before = productState('CONFIRM');
    const mid = dispatch(before, { type: 'RECONNECT_STARTED' });
    const after = dispatch(mid.state, { type: 'RECONNECT_COMPLETED' });
    assert.deepEqual(after.state.mode, before.mode);
    pass('5. reconnect facts preserve AppMode');
  }

  {
    const types = readFileSync(
      'apps/web/src/app-coordinator/app-coordinator.types.ts',
      'utf8',
    );
    assert.doesNotMatch(types, /REPLY_COMPOSE|NotificationResumeDestination/);
    assert.doesNotMatch(
      types,
      /\| \{ type: 'NOTIFICATION'; itemId: string \}/,
    );
    pass('6. AppMode has no NOTIFICATION or REPLY_COMPOSE');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
