/**
 * Stage 7 Phase 2 — Coordinator transitions without Runtime auto-activation.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-transition-matrix.test.ts
 */
import assert from 'node:assert/strict';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import {
  selectApplicationSurfaceOwner,
  selectNotificationItemId,
  selectProductRoute,
  selectReplyCompose,
} from '../src/app-coordinator/app-coordinator.selectors';
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorEvent,
  type AppCoordinatorState,
  type ProductRoute,
} from '../src/app-coordinator/app-coordinator.types';

let passed = 0;
const tokens = createSequentialResumeTokenFactory('matrix');

function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function productState(route: ProductRoute): AppCoordinatorState {
  return {
    mode: { type: 'PRODUCT', route },
    resumeDestination: { type: 'PRODUCT', route },
    lastSettledReply: null,
  };
}

function notificationState(
  itemId: string,
  returnRoute: ProductRoute = 'LOBBY',
): AppCoordinatorState {
  return {
    mode: { type: 'NOTIFICATION', itemId },
    resumeDestination: { type: 'PRODUCT', route: returnRoute },
    lastSettledReply: null,
  };
}

function dispatch(state: AppCoordinatorState, event: AppCoordinatorEvent) {
  return appCoordinatorReducer(state, event);
}

async function main() {
  {
    const result = dispatch(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: null,
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(selectApplicationSurfaceOwner(result.state), 'PRODUCT_FLOW');
    pass('1. ordinary launch → PRODUCT(LOBBY)');
  }

  {
    const result = dispatch(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: 'incoming:A',
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(selectNotificationItemId(result.state), null);
    pass('2. boot with pending item → Product (no auto Notification)');
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
    pass('3. deeplink ENTRY ingests Runtime only; mode stays Product');
  }

  {
    const result = dispatch(productState('LOBBY'), {
      type: 'PRODUCT_COMPOSE_REQUESTED',
    });
    assert.equal(selectProductRoute(result.state), 'WHO');
    pass('4. ordinary compose remains Product-owned');
  }

  {
    const token = tokens.create();
    let state = notificationState('incoming:A');
    let result = dispatch(state, {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'u1',
      resumeToken: token,
    });
    assert.equal(selectReplyCompose(result.state)?.route, 'WHAT');
    result = dispatch(result.state, {
      type: 'REPLY_CANCELLED',
      resumeToken: token,
    });
    assert.equal(selectProductRoute(result.state), 'LOBBY');
    assert.equal(selectNotificationItemId(result.state), null);
    pass('5. reply cancel returns to Product');
  }

  {
    const token = tokens.create();
    let state = notificationState('incoming:A', 'BANS');
    let result = dispatch(state, {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'u1',
      resumeToken: token,
    });
    result = dispatch(result.state, {
      type: 'REPLY_ROUTE_CHANGED',
      resumeToken: token,
      route: 'SUCCESS',
    });
    result = dispatch(result.state, {
      type: 'REPLY_COMPLETED',
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(selectProductRoute(result.state), 'BANS');
    pass('6. reply completion returns saved Product route immediately');
  }

  {
    const before = productState('CONFIRM');
    const mid = dispatch(before, { type: 'RECONNECT_STARTED' });
    const after = dispatch(mid.state, { type: 'RECONNECT_COMPLETED' });
    assert.deepEqual(after.state.mode, before.mode);
    pass('7. reconnect facts preserve AppMode');
  }

  {
    const types = await import('node:fs').then((fs) =>
      fs.readFileSync(
        'apps/web/src/app-coordinator/app-coordinator.types.ts',
        'utf8',
      ),
    );
    assert.doesNotMatch(types, /RUNTIME_CURRENT_CHANGED|RUNTIME_QUEUE_DRAINED/);
    pass('8. no Runtime activation events in Coordinator union');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
