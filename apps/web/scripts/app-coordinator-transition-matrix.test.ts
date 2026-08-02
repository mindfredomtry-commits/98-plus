/**
 * Stage 8 Phase 1 — Coordinator transitions (currentOwner policy).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import {
  selectApplicationSurfaceOwner,
  selectCurrentOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import { APP_COORDINATOR_TRANSITION_MATRIX } from '../src/app-coordinator/app-coordinator.transition-matrix';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEvent,
  type AppCoordinatorState,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function createBanOwner(): AppCoordinatorState {
  return {
    currentOwner: { type: 'DOMAIN', domain: 'CREATE_BAN' },
    returnOwner: null,
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
    assert.deepEqual(selectCurrentOwner(result.state), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(selectApplicationSurfaceOwner(result.state), 'CREATE_BAN');
    pass('1. ordinary launch → DOMAIN(CREATE_BAN)');
  }

  {
    const result = dispatch(createBanOwner(), {
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:deeplink',
        notificationKind: 'incoming',
      },
    });
    assert.deepEqual(selectCurrentOwner(result.state), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(result.effects[0]?.target, 'NOTIFICATION_RUNTIME');
    pass('2. deeplink ENTRY ingests; owner stays CREATE_BAN');
  }

  {
    const result = dispatch(createBanOwner(), {
      type: 'ENTRY_ROUTED',
      intent: { type: 'PRODUCT' },
    });
    assert.equal(selectApplicationSurfaceOwner(result.state), 'CREATE_BAN');
    assert.equal(result.effects.length, 0);
    pass('3. PRODUCT entry keeps CREATE_BAN owner');
  }

  {
    const result = dispatch(createBanOwner(), {
      type: 'DOMAIN_RELEASED',
    });
    assert.equal(selectApplicationSurfaceOwner(result.state), 'CREATE_BAN');
    assert.equal(
      result.effects.some(
        (e) =>
          e.target === 'NOTIFICATION_RUNTIME' &&
          e.command.type === 'FLUSH_DEFERRED_DIRECT_ENTRY',
      ),
      true,
    );
    pass('4. Domain release flushes deferred direct entry');
  }

  {
    const before = createBanOwner();
    const mid = dispatch(before, { type: 'RECONNECT_STARTED' });
    const after = dispatch(mid.state, { type: 'RECONNECT_COMPLETED' });
    assert.deepEqual(after.state.currentOwner, before.currentOwner);
    pass('5. reconnect facts preserve currentOwner');
  }

  {
    const types = readFileSync(
      'apps/web/src/app-coordinator/app-coordinator.types.ts',
      'utf8',
    );
    assert.doesNotMatch(types, /REPLY_COMPOSE|NotificationResumeDestination/);
    assert.match(types, /currentOwner/);
    pass('6. currentOwner authority; no reply-compose mode');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
