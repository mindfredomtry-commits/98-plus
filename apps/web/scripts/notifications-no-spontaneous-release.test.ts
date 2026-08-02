/**
 * Stage 8 Phase 5 hotfix — first activated item must not auto-release.
 *
 * Presentation/read-model observation must never emit NOTIFICATIONS_RELEASE.
 * Release only from: user close, item completion, or typed NO_READY_ITEM.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-no-spontaneous-release.test.ts
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
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createNotificationRuntimeStore,
  dismissRuntimeHead,
} from '../src/notification-runtime/notification-runtime.store';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string, text: string, createdAt: string): BanInteraction {
  return {
    id,
    text,
    createdAt,
    sender: { id: 's1', firstName: 'Анна', username: 'anna' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

const webSrc = join(process.cwd(), 'apps/web/src');

function main(): void {
  {
    const runtimeStore = createNotificationRuntimeStore();
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });

    lifecycle.runtimePort.notifyBootCompleted();

    let releaseCount = 0;
    lifecycle.store.subscribe((_state, _prev, event) => {
      if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
        releaseCount += 1;
      }
    });

    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('one', 'первый', '2026-07-01T10:00:00.000Z')),
      source: 'websocket',
    });
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('two', 'второй', '2026-07-01T10:01:00.000Z')),
      source: 'websocket',
    });

    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });

    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:one');
    assert.equal(releaseCount, 0);

    // Simulate intermediate Runtime emissions that do not complete the item.
    receiveNotificationItem(runtimeStore, {
      item: itemFromIncoming(ban('three', 'хвост', '2026-07-01T10:02:00.000Z')),
      source: 'websocket',
    });
    const snap1 = lifecycle.notificationsController.getState();
    const snap2 = lifecycle.notificationsController.getState();
    assert.equal(Object.is(snap1, snap2), true);
    assert.equal(snap1.activation.type, 'ACTIVE');
    assert.equal(snap1.activeItem?.itemId, 'incoming:one');

    const view = presentNotificationsState(snap1);
    assert.equal(view.phase, 'ITEM');

    const emptyView = presentNotificationsState({
      activation: { type: 'INACTIVE' },
      activeItem: null,
      actionStatus: 'idle',
      actionErrorCode: null,
      lastActivationOutcome: { type: 'ACTIVATED', itemId: 'incoming:one' },
    });
    assert.equal(emptyView.phase, 'EMPTY');
    assert.equal(releaseCount, 0);
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:one');
    assert.equal(
      runtimeStore.getState().consumed.itemIds.includes('incoming:one'),
      false,
    );
    pass('1-8. First open stays active across emissions; EMPTY does not release');

    dismissRuntimeHead(
      runtimeStore,
      'incoming:one',
      'user_dismiss',
      'user',
    );
    assert.equal(releaseCount, 1);
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReturnOwner(lifecycle.store.getState()), null);
    assert.equal(selectReadyHeadId(runtimeStore.getState()), 'incoming:two');
    assert.equal(selectActiveItemId(runtimeStore.getState()), null);
    pass('9-11. Completion releases once; item 2 remains ready/passive');

    releaseCount = 0;
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'NOTIFICATIONS',
    );
    assert.equal(selectActiveItemId(runtimeStore.getState()), 'incoming:two');
    assert.equal(releaseCount, 0);

    const snapA = lifecycle.notificationsController.getState();
    const snapB = lifecycle.notificationsController.getState();
    assert.equal(Object.is(snapA, snapB), true);
    assert.equal(snapA.activeItem?.itemId, 'incoming:two');
    assert.equal(releaseCount, 0);
    pass('12-13. Reopen item 2 stays until explicit action');

    lifecycle.dispose();
  }

  {
    // Typed rollback only on NO_READY_ITEM — not on null activeItem observation.
    const runtimeStore = createNotificationRuntimeStore();
    let releaseCount = 0;
    const lifecycle = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken: () => 'tok',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    const originalDispatch = lifecycle.dispatch.bind(lifecycle);
    lifecycle.dispatch = (event) => {
      if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
        releaseCount += 1;
      }
      originalDispatch(event);
    };
    lifecycle.runtimePort.notifyBootCompleted();

    // Open with empty queue → availability gate prevents switch (no release from
    // activation outcome path). Prove lifecycle source no longer observes activeItem.
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(
      selectApplicationSurfaceOwner(lifecycle.store.getState()),
      'CREATE_BAN',
    );

    const lifeSrc = readFileSync(
      join(webSrc, 'app-coordinator/app-coordinator.lifecycle.ts'),
      'utf8',
    );
    assert.match(lifeSrc, /NO_READY_ITEM/);
    assert.doesNotMatch(lifeSrc, /activeItem == null/);
    assert.doesNotMatch(lifeSrc, /activation\.type === 'INACTIVE'/);

    const ctrlSrc = readFileSync(
      join(webSrc, 'notifications/notifications.controller.ts'),
      'utf8',
    );
    assert.match(ctrlSrc, /stillQueued/);
    assert.match(ctrlSrc, /sessionCompleted/);

    void releaseCount;
    pass('Lifecycle releases only on typed NO_READY_ITEM; session needs dequeue');
    lifecycle.dispose();
  }

  {
    const surface = readFileSync(
      join(webSrc, 'notifications/presentation/NotificationsSurface.tsx'),
      'utf8',
    );
    assert.doesNotMatch(surface, /useEffect/);
    assert.doesNotMatch(surface, /NOTIFICATIONS_RELEASE_REQUESTED/);
    assert.match(surface, /CLOSE_PRESSED|onReleaseNotifications|ACTIVE_ITEM_CLOSE/);
    pass('Surface has no mount effect that releases ownership');
  }

  console.log(`\n${passed} passed\n`);
}

main();
