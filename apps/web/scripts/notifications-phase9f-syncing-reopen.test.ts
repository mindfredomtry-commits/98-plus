import assert from 'node:assert/strict';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  fixtureContractIncoming,
  fixturePresentationIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'u';

function seed(store: ReturnType<typeof createNotificationRuntimeStore>) {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't',
    snapshot: fixtureSnapshot({
      revision: '2',
      items: [
        fixtureContractIncoming({ banId: 'Ban1', userId: USER, sequence: '1' }),
        fixtureContractIncoming({ banId: 'Ban2', userId: USER, sequence: '2' }),
      ],
    }),
    presentationByItemId: {
      'incoming:Ban1': fixturePresentationIncoming('Ban1', USER),
      'incoming:Ban2': fixturePresentationIncoming('Ban2', USER),
    },
    source: 'test',
  });
}

{
  const store = createNotificationRuntimeStore();
  seed(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  life.dispatchDomainIntent({
    domain: 'NOTIFICATIONS',
    intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
  });
  life.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });

  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 'x',
    source: 'user',
  });
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  assert.equal(store.getState().activeItemId, 'incoming:Ban1');
  const view = presentNotificationsState(life.notificationsController.getState());
  assert.equal(view.phase, 'ITEM');
  console.log('PASS — open while SYNCING with items → Ban1');
  life.dispose();
}

{
  const store = createNotificationRuntimeStore();
  seed(store);
  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'tok',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });

  let nested = false;
  life.store.subscribe((_s, _p, event) => {
    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED' && !nested) {
      nested = true;
      life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    }
  });

  life.dispatchDomainIntent({
    domain: 'NOTIFICATIONS',
    intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
  });
  life.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });

  // Nested OPEN during RELEASE must still activate via onEventProcessed.
  assert.equal(store.getState().activeItemId, 'incoming:Ban1');
  {
    const owner = life.store.getState().currentOwner;
    assert.equal(owner.type, 'DOMAIN');
    if (owner.type === 'DOMAIN') {
      // Surface RELEASE#2 may return to Lobby after nested open activated.
      assert.ok(
        owner.domain === 'NOTIFICATIONS' || owner.domain === 'CREATE_BAN',
      );
    }
  }
  console.log('PASS — QUEUED open during release activates Ban1', {
    owner: life.store.getState().currentOwner,
    active: store.getState().activeItemId,
  });
  life.dispose();
}

console.log('\n2 passed\n');
