/**
 * Stage 8 Phase 5 hotfix — manual OPEN with two ingested items (production graph).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-manual-open-two-items.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import {
  selectApplicationSurfaceOwner,
  selectReturnOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import { notificationRuntimeReducer } from '../src/notification-runtime/notification-runtime.reducer';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createInitialNotificationRuntimeState } from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string, text: string): BanInteraction {
  return {
    id,
    text,
    sender: { id: 's1', firstName: 'Анна', username: 'anna' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

const webSrc = join(process.cwd(), 'apps/web/src');

function main(): void {
  {
    const runtimeStore = createNotificationRuntimeStore();
    const storeIdentity = runtimeStore;

    let activationDispatches = 0;
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });

    const port = lifecycle.domainPorts.NOTIFICATIONS;
    const originalDispatch = port.dispatch.bind(port);
    port.dispatch = (intent) => {
      if (intent.type === 'ACTIVATE_READY_ITEM_REQUESTED') {
        activationDispatches += 1;
      }
      originalDispatch(intent);
    };

    lifecycle.runtimePort.notifyBootCompleted();
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );

    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('one', 'первый')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('two', 'второй')),
      source: 'websocket',
    });

    assert.equal(runtimeStore.getState().items.queue.length, 2);
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'incoming:one');
    assert.equal(selectActiveItemId(runtimeStore.getState()), null);

    assert.deepEqual(lifecycle.domainPorts.NOTIFICATIONS.getAvailability(), {
      availability: 'AVAILABLE',
    });
    assert.equal(
      lifecycle.notificationsController.getState().activation.type,
      'INACTIVE',
    );
    pass('1-4. Two-item ingest; availability AVAILABLE before UI mount');

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });

    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.deepEqual(selectReturnOwner(lifecycle.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(activationDispatches, 1);
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:one');
    assert.equal(runtimeStore.getState().items.queue.length, 2);
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'incoming:one');

    const domain = lifecycle.notificationsController.getState();
    assert.equal(domain.activation.type, 'ACTIVE');
    assert.equal(domain.activeItem?.itemId, 'incoming:one');
    assert.equal(domain.activeItem?.kind, 'incoming');

    const view = presentNotificationsState(domain);
    assert.equal(view.phase, 'ITEM');
    if (view.phase === 'ITEM') {
      assert.equal(view.itemId, 'incoming:one');
    }

    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.deepEqual(selectReturnOwner(lifecycle.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });

    assert.equal(storeIdentity, runtimeStore);
    assert.equal(
      lifecycle.domainPorts.NOTIFICATIONS.getAvailability().availability,
      'AVAILABLE',
    );
    pass('5-12. Open → NOTIFICATIONS; one activation; item1 active; no release');

    lifecycle.dispose();
  }

  {
    const item = itemFromIncoming(ban('b', 'b'));
    const stale = {
      ...createInitialNotificationRuntimeState(),
      items: { queue: [item] },
      activation: { type: 'ACTIVE' as const, itemId: 'incoming:gone' },
    };
    const result = notificationRuntimeReducer(stale, {
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    assert.deepEqual(result.state.activation, {
      type: 'ACTIVE',
      itemId: 'incoming:b',
    });
    pass('Stale ACTIVE recovery claims ready head');
  }

  {
    const apps = readFileSync(
      join(webSrc, 'app-services/AppServicesProvider.tsx'),
      'utf8',
    );
    assert.match(apps, /onboardRef/);
    assert.match(apps, /refreshUserRef/);
    assert.doesNotMatch(
      apps,
      /}, \[runtimeStore, getToken, onboard, refreshUser\]\)/,
    );

    const transport = readFileSync(
      join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
      'utf8',
    );
    assert.match(transport, /runPendingRefreshRef\.current/);
    assert.match(transport, /after-bootstrap/);

    const controller = readFileSync(
      join(webSrc, 'notifications/notifications.controller.ts'),
      'utf8',
    );
    assert.match(controller, /beforeItem/);
    assert.match(controller, /CLEAR_ACTIVATION_REQUESTED/);
    pass(
      'Source guards: stable lifecycle deps + pending hydrate + stale recover',
    );
  }

  console.log(`\n${passed} passed\n`);
}

main();
