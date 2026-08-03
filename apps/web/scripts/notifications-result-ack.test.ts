/**
 * Stage 8 Phase 5 — result item server acknowledgement.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-result-ack.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import {
  selectApplicationSurfaceOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  itemFromIncoming,
  itemFromResult,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import type { ResultAckTransport } from '../src/notification-runtime/notification-runtime.result-ack-action';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const webSrc = (() => {
  const fromRoot = join(process.cwd(), 'apps/web/src');
  try {
    readFileSync(
      join(fromRoot, 'notification-runtime/notification-runtime.result-ack-action.ts'),
    );
    return fromRoot;
  } catch {
    return join(process.cwd(), 'src');
  }
})();

function ban(id: string, createdAt: string, text = id): BanInteraction {
  return {
    id,
    text,
    createdAt,
    sender: { id: 's1', firstName: 'Анна', username: 'anna' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

function timeoutResult(
  id: string,
  completedAt: string,
): BanResult {
  return {
    id,
    text: 'таймаут',
    outcome: 'timeout',
    headline: 'ТАЙМАУТ',
    subline: 'Проверка не завершена.',
    sender: {
      id: 's1',
      telegramId: '1',
      firstName: 'Анна',
      username: 'anna',
    },
    receiver: {
      id: 'r1',
      telegramId: '2',
      firstName: 'R',
      username: 'r',
    },
    viewerId: 'r1',
    opponent: {
      id: 's1',
      telegramId: '1',
      firstName: 'Анна',
      username: 'anna',
    },
    confirmations: null,
    energy: { sender: 0, receiver: 0 },
    farmSkipped: true,
    completedAt,
    deepLink: '',
    shareLink: '',
    inviteOpponentLink: '',
  };
}

function trackingAck(
  impl: ResultAckTransport,
): { transport: ResultAckTransport; calls: { banId: string }[] } {
  const calls: { banId: string }[] = [];
  return {
    calls,
    transport: async (input) => {
      calls.push({ banId: input.banId });
      return impl(input);
    },
  };
}

async function main(): Promise<void> {
  // 1–2. TIMEOUT pending (seenAt null implied) → manual open activates result
  {
    const runtimeStore = createNotificationRuntimeStore();
    const { transport, calls } = trackingAck(async () => ({ ok: true }));
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    lifecycle.runtimePort.notifyBootCompleted();

    // Older timeout before newer incoming — FIFO head = result
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('old-timeout', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('newer', '2026-07-01T10:00:00.000Z')),
      source: 'websocket',
    });
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'result:old-timeout');
    assert.equal(calls.length, 0);

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'result:old-timeout');
    assert.equal(calls.length, 0, 'open must not ack');
    pass('1-2. TIMEOUT ready; open activates result; no ack on open');
    lifecycle.dispose();
  }

  // 3. CLOSE only — no server ack; item remains
  {
    const runtimeStore = createNotificationRuntimeStore();
    const { transport, calls } = trackingAck(async () => ({ ok: true }));
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    lifecycle.runtimePort.notifyBootCompleted();
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-close', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'result:t-close');

    lifecycle.notificationsController.dispatch({
      type: 'ACTIVE_ITEM_CLOSE_REQUESTED',
    });
    lifecycle.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });

    assert.equal(calls.length, 0, 'CLOSE must not ack');
    assert.equal(
      selectReadyHeadId(runtimeStore.getState()),
      'result:t-close',
      'item remains pending/ready',
    );
    assert.equal(
      runtimeStore.getState().consumed.itemIds.includes('result:t-close'),
      false,
    );
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    pass('3. CLOSE releases owner only; no ack; item stays');
    lifecycle.dispose();
  }

  // 4–6. Explicit dismiss → one ack; consume; session complete; no re-enqueue
  {
    const runtimeStore = createNotificationRuntimeStore();
    const { transport, calls } = trackingAck(async () => ({ ok: true }));
    let refreshCount = 0;
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    // Wire refresh via controller intents — recreate with onRefresh by
    // dispatching dismiss through a controller that has refresh + ack.
    lifecycle.dispose();

    const { createNotificationsController } = await import(
      '../src/notifications/notifications.controller'
    );
    let sessionCompleted = 0;
    const controller = createNotificationsController({
      store: runtimeStore,
      getToken: () => 'tok',
      resultAckTransport: transport,
      onRefresh: async () => {
        refreshCount += 1;
      },
      sink: {
        sessionCompleted() {
          sessionCompleted += 1;
        },
      },
    });

    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-dismiss', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('ban-2', '2026-07-01T10:00:00.000Z')),
      source: 'websocket',
    });
    controller.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'result:t-dismiss');

    await controller.dispatch({
      type: 'ITEM_ACTION_REQUESTED',
      action: { type: 'DISMISS_RESULT' },
    } as never);
    // dispatch is sync for starting async — wait microtasks
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls.length, 1, 'exactly one result ack');
    assert.equal(calls[0]?.banId, 't-dismiss');
    assert.equal(
      runtimeStore.getState().items.queue.some(
        (i) => notificationItemId(i) === 'result:t-dismiss',
      ),
      false,
    );
    assert.equal(
      runtimeStore.getState().consumed.itemIds.filter((id) => id === 'result:t-dismiss')
        .length,
      1,
    );
    assert.equal(sessionCompleted, 1);
    assert.ok(refreshCount >= 1, 'pending refresh after ack');

    // Simulate pending refresh still returning the same result — must not re-enqueue
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-dismiss', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    assert.equal(
      runtimeStore.getState().items.queue.some(
        (i) => notificationItemId(i) === 'result:t-dismiss',
      ),
      false,
    );
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'incoming:ban-2');
    pass('4-6. Dismiss acks once; consume; sessionCompleted; no re-enqueue');
    controller.dispose();
  }

  // 5b. Full owner release on dismiss success
  {
    const runtimeStore = createNotificationRuntimeStore();
    const { transport, calls } = trackingAck(async () => ({ ok: true }));
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    lifecycle.runtimePort.notifyBootCompleted();
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-release', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );

    lifecycle.domainPorts.NOTIFICATIONS.dispatch({
      type: 'ITEM_ACTION_REQUESTED',
      action: { type: 'DISMISS_RESULT' },
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls.length, 1);
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), null);
    pass('5. Ack success releases Notifications owner');
    lifecycle.dispose();
  }

  // 7–8. Ack failure keeps active + retry; retry success consumes once
  {
    const runtimeStore = createNotificationRuntimeStore();
    let failOnce = true;
    const { transport, calls } = trackingAck(async () => {
      if (failOnce) {
        failOnce = false;
        return { ok: false, errorCode: 'RESULT_ACK_HTTP_500', status: 500 };
      }
      return { ok: true };
    });
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    lifecycle.runtimePort.notifyBootCompleted();
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-fail', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });

    lifecycle.domainPorts.NOTIFICATIONS.dispatch({
      type: 'ITEM_ACTION_REQUESTED',
      action: { type: 'DISMISS_RESULT' },
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls.length, 1);
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'result:t-fail');
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(runtimeStore.getState().action.status, 'failed');
    const view = presentNotificationsState(
      lifecycle.notificationsController.getState(),
    );
    assert.equal(view.phase, 'ITEM');
    if (view.phase === 'ITEM') {
      assert.ok(view.actions.some((a) => a.id === 'RETRY'));
    }
    pass('7. Ack failure keeps active; no release; retry available');

    lifecycle.domainPorts.NOTIFICATIONS.dispatch({ type: 'RETRY_REQUESTED' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls.length, 2);
    assert.equal(
      runtimeStore.getState().consumed.itemIds.includes('result:t-fail'),
      true,
    );
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    pass('8. Retry success consumes/releases once');
    lifecycle.dispose();
  }

  // 9. Duplicate / already-seen (404) → idempotent success
  {
    const runtimeStore = createNotificationRuntimeStore();
    const { transport, calls } = trackingAck(async () => ({
      ok: false,
      errorCode: 'RESULT_ACK_ALREADY_SEEN',
      status: 404,
    }));
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
      resultAckTransport: transport,
    });
    lifecycle.runtimePort.notifyBootCompleted();
    receiveNotificationItem(runtimeStore, {
      item: itemFromResult(
        timeoutResult('t-seen', '2026-06-01T10:00:00.000Z'),
      ),
      source: 'poll',
    });
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    lifecycle.domainPorts.NOTIFICATIONS.dispatch({
      type: 'ITEM_ACTION_REQUESTED',
      action: { type: 'DISMISS_RESULT' },
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(calls.length, 1);
    assert.equal(
      runtimeStore.getState().consumed.itemIds.includes('result:t-seen'),
      true,
    );
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    pass('9. Already-seen/404 treated as idempotent success');
    lifecycle.dispose();
  }

  // 10. Source guards — result_ack wired; CLOSE path has no ack
  {
    const effects = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.effects.ts'),
      'utf8',
    );
    assert.match(effects, /result_ack/);
    assert.match(effects, /\/bans\/\$\{encodeURIComponent\(banId\)\}\/result\/ack/);
    const intents = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.intents.ts'),
      'utf8',
    );
    assert.match(intents, /requestResultAckAction/);
    assert.doesNotMatch(
      intents.split('async dismissResult')[1]?.split('async dismissCurrent')[0] ??
        '',
      /dismissRuntimeHead/,
    );
    const surface = readFileSync(
      join(webSrc, 'notifications/presentation/NotificationsSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /ACTIVE_ITEM_CLOSE/);
    assert.doesNotMatch(surface, /result\/ack|DISMISS_RESULT/);
    pass('10. Source: ack on dismiss only; CLOSE does not ack');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
