import assert from 'node:assert/strict';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import {
  selectApplicationSurfaceOwner,
  selectNotificationItemId,
  selectProductRoute,
  selectReplyCompose,
} from '../src/app-coordinator/app-coordinator.selectors';
import { APP_COORDINATOR_TRANSITION_MATRIX } from '../src/app-coordinator/app-coordinator.transition-matrix';
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
  assert.equal(APP_COORDINATOR_TRANSITION_MATRIX.length, 15);

  {
    const started = dispatch(createInitialAppCoordinatorState(), {
      type: 'APP_STARTED',
    });
    assert.deepEqual(started.effects, []);
    const booted = dispatch(started.state, {
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: null,
    });
    assert.equal(selectProductRoute(booted.state), 'LOBBY');
    assert.equal(selectApplicationSurfaceOwner(booted.state), 'PRODUCT_FLOW');
    pass('1. ordinary launch → PRODUCT(LOBBY)');
  }

  {
    const state = productState('LOBBY');
    const intent = {
      type: 'NOTIFICATION',
      itemId: 'incoming:A',
      notificationKind: 'incoming',
    } as const;
    const routed = dispatch(state, { type: 'ENTRY_ROUTED', intent });
    assert.equal(routed.state, state);
    assert.deepEqual(routed.effects[0], {
      target: 'NOTIFICATION_RUNTIME',
      command: { type: 'INGEST_ENTRY', intent },
    });
    const presented = dispatch(state, {
      type: 'RUNTIME_CURRENT_CHANGED',
      itemId: 'incoming:A',
    });
    assert.equal(selectNotificationItemId(presented.state), 'incoming:A');
    pass('2. incoming deeplink → canonical NOTIFICATION');
  }

  {
    const intent = {
      type: 'NOTIFICATION',
      itemId: 'result:R',
      notificationKind: 'status',
    } as const;
    const routed = dispatch(createInitialAppCoordinatorState(), {
      type: 'ENTRY_ROUTED',
      intent,
    });
    assert.deepEqual(routed.effects[0], {
      target: 'NOTIFICATION_RUNTIME',
      command: { type: 'INGEST_ENTRY', intent },
    });
    pass('3. status deeplink uses canonical Runtime path');
  }

  {
    const result = dispatch(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: 'check:P',
    });
    assert.equal(selectNotificationItemId(result.state), 'check:P');
    pass('4. pending at boot → NOTIFICATION');
  }

  {
    const result = dispatch(productState('LOBBY'), {
      type: 'RUNTIME_CURRENT_CHANGED',
      itemId: 'incoming:WS',
    });
    assert.equal(selectNotificationItemId(result.state), 'incoming:WS');
    assert.deepEqual(result.effects, []);
    pass('5. WebSocket during Lobby → NOTIFICATION');
  }

  {
    for (const route of ['WHO', 'WHAT', 'CONFIRM'] as const) {
      const state = productState(route);
      const result = dispatch(state, {
        type: 'RUNTIME_CURRENT_CHANGED',
        itemId: `incoming:${route}`,
      });
      assert.equal(result.state, state);
    }
    pass('6. WebSocket during product compose stays queued');
  }

  {
    const token = tokens.create();
    const result = dispatch(notificationState('incoming:A'), {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    });
    assert.equal(selectReplyCompose(result.state)?.resumeToken, token);
    assert.deepEqual(
      result.effects.map((effect) => effect.target),
      ['NOTIFICATION_RUNTIME', 'PRODUCT_FLOW'],
    );
    pass('7. reply from incoming suspends Runtime and opens WHAT');
  }

  {
    const result = dispatch(notificationState('result:R', 'BANS'), {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'result:R',
      targetUserId: 'user:B',
      resumeToken: tokens.create(),
    });
    assert.equal(result.state.mode.type, 'REPLY_COMPOSE');
    assert.deepEqual(result.state.resumeDestination, {
      type: 'NOTIFICATION',
      itemId: 'result:R',
      afterQueue: { type: 'PRODUCT', route: 'BANS' },
    });
    pass('8. reply from status uses identical suspend contract');
  }

  {
    const token = tokens.create();
    const reply = dispatch(notificationState('incoming:A'), {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    }).state;
    const stale = dispatch(reply, {
      type: 'REPLY_CANCELLED',
      resumeToken: tokens.create(),
    });
    assert.equal(stale.violation?.code, 'STALE_RESUME_TOKEN');
    const cancelled = dispatch(reply, {
      type: 'REPLY_CANCELLED',
      resumeToken: token,
    });
    assert.equal(selectNotificationItemId(cancelled.state), 'incoming:A');
    assert.match(JSON.stringify(cancelled.effects), /RESUME/);
    pass('9. reply cancel restores exact source');
  }

  {
    const token = tokens.create();
    let state = dispatch(notificationState('incoming:A'), {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'incoming:A',
      targetUserId: 'user:B',
      resumeToken: token,
    }).state;
    state = dispatch(state, {
      type: 'PRODUCT_ROUTE_CHANGED',
      route: 'SUCCESS',
    }).state;
    const completed = dispatch(state, {
      type: 'REPLY_COMPLETED',
      resumeToken: token,
      sourceItemId: 'incoming:A',
    });
    assert.equal(selectReplyCompose(completed.state)?.completionPending, true);
    assert.deepEqual(
      completed.effects.map((effect) => effect.command.type),
      ['COMPLETE_SOURCE_ITEM', 'RESUME'],
    );
    const next = dispatch(completed.state, {
      type: 'RUNTIME_CURRENT_CHANGED',
      itemId: 'check:NEXT',
    });
    assert.equal(selectNotificationItemId(next.state), 'check:NEXT');
    const drained = dispatch(completed.state, {
      type: 'RUNTIME_QUEUE_DRAINED',
    });
    assert.equal(selectProductRoute(drained.state), 'LOBBY');
    pass('10. reply completion resumes next or saved Product route');
  }

  {
    const result = dispatch(productState('LOBBY'), {
      type: 'PRODUCT_COMPOSE_REQUESTED',
    });
    assert.equal(selectProductRoute(result.state), 'WHO');
    assert.match(JSON.stringify(result.effects), /SUSPEND/);
    assert.match(JSON.stringify(result.effects), /OPEN_ROUTE/);
    pass('11. ordinary compose remains Product-owned');
  }

  {
    const result = dispatch(notificationState('incoming:A'), {
      type: 'RUNTIME_CURRENT_CHANGED',
      itemId: 'check:B',
    });
    assert.equal(selectNotificationItemId(result.state), 'check:B');
    pass('12. Runtime queue advancement changes notification identity');
  }

  {
    const result = dispatch(notificationState('result:R', 'BANS'), {
      type: 'RUNTIME_QUEUE_DRAINED',
    });
    assert.equal(selectProductRoute(result.state), 'BANS');
    assert.deepEqual(result.effects[0], {
      target: 'PRODUCT_FLOW',
      command: { type: 'OPEN_ROUTE', route: 'BANS' },
    });
    pass('13. queue drained resumes saved Product route');
  }

  {
    const states = [
      createInitialAppCoordinatorState(),
      productState('CONFIRM'),
      notificationState('incoming:A'),
    ];
    for (const state of states) {
      assert.equal(
        dispatch(state, { type: 'RECONNECT_STARTED' }).state,
        state,
      );
      assert.equal(
        dispatch(state, { type: 'RECONNECT_COMPLETED' }).state,
        state,
      );
    }
    pass('14. reconnect facts preserve AppMode');
  }

  {
    const state = notificationState('incoming:A');
    const event: AppCoordinatorEvent = {
      type: 'ENTRY_ROUTED',
      intent: {
        type: 'NOTIFICATION',
        itemId: 'incoming:A',
        notificationKind: 'incoming',
      },
    };
    const first = dispatch(state, event);
    const second = dispatch(first.state, event);
    assert.deepEqual(first.effects, second.effects);
    assert.match(JSON.stringify(first.effects), /INGEST_ENTRY/);
    pass('15. repeated entry remains Runtime dedupe concern');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
