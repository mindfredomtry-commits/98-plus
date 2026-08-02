/**
 * Stage 8 Phase 5 — Notifications domain (manual open + explicit activation).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase5-notifications.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
import { decideOwnerSwitch } from '../src/app-coordinator/application-policy';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';
import { createSettingsController } from '../src/settings/settings.controller';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
} from '../src/notifications/presentation/notifications.presenter';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { mapNotificationsCapability } from '../src/notifications/notifications.capability';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import type { BanInteraction } from '@98plus/shared';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const root = process.cwd();
const webSrc = join(root, 'apps/web/src');

function ban(id: string, text = 'текст'): BanInteraction {
  return {
    id,
    text,
    sender: {
      id: 's1',
      firstName: 'Анна',
      username: 'anna',
    },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

function createHarness() {
  const calls: string[] = [];
  const violations: AppCoordinatorInvariantViolation[] = [];
  const runtimeStore = createNotificationRuntimeStore();

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

  let store!: ReturnType<typeof createAppCoordinatorStore>;

  const notificationsController = createNotificationsController({
    store: runtimeStore,
    getToken: () => null,
    sink: {
      sessionCompleted() {
        calls.push('sessionCompleted');
        const owner = store.getState().currentOwner;
        if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
          store.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
        }
      },
    },
  });

  const domainPorts = {
    CREATE_BAN: productController.asDomainPort(),
    SETTINGS: settingsController.asDomainPort(),
    NOTIFICATIONS: notificationsController.asDomainPort(),
  };

  store = createAppCoordinatorStore({
    initialState: createInitialAppCoordinatorState(),
    executor: createAppCoordinatorCommandExecutor({
      notificationRuntime: runtime,
    }),
    reduceContext: {
      getCurrentCapability() {
        const owner = store.getState().currentOwner;
        if (owner.type !== 'DOMAIN') return null;
        return domainPorts[owner.domain].getCapability();
      },
      getTargetAvailability(domain) {
        if (domain === 'NOTIFICATIONS') {
          return domainPorts.NOTIFICATIONS.getAvailability();
        }
        return { availability: 'AVAILABLE' };
      },
    },
    onInvariantViolation(v) {
      violations.push(v);
    },
  });

  const runtimeSink = createNotificationRuntimeEventSink((e) => {
    store.dispatch(e);
  });

  function openNotifications(): void {
    store.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    const owner = store.getState().currentOwner;
    if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
      domainPorts.NOTIFICATIONS.dispatch({
        type: 'ACTIVATE_READY_ITEM_REQUESTED',
      });
      if (notificationsController.getState().activation.type === 'INACTIVE') {
        store.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
      }
    }
  }

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
    if (input.domain === 'SETTINGS') {
      domainPorts.SETTINGS.dispatch(input.intent);
      calls.push(`settings:${input.intent.type}`);
      return;
    }
    domainPorts.NOTIFICATIONS.dispatch(input.intent);
    calls.push(`notifications:${input.intent.type}`);
  }

  return {
    store,
    calls,
    violations,
    runtimeSink,
    runtimeStore,
    productController,
    settingsController,
    notificationsController,
    domainPorts,
    openNotifications,
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
    pass('1. Boot → currentOwner = CREATE_BAN');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('i1')),
      source: 'websocket',
    });
    assert.equal(harness.runtimeStore.getState().items.queue.length, 1);
    assert.equal(selectReadyHeadId(harness.runtimeStore.getState()), 'incoming:i1');
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), null);
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(harness.calls.includes('sessionCompleted'), false);
    pass('2. Ingest → FIFO; owner stays CREATE_BAN; no active item');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    const beforeReturn = selectReturnOwner(harness.store.getState());
    harness.openNotifications();
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReturnOwner(harness.store.getState()), beforeReturn);
    assert.equal(
      harness.violations.some((v) => v.code === 'NOTIFICATIONS_UNAVAILABLE'),
      true,
    );
    pass('3. Open with no ready item → stay CREATE_BAN; typed unavailable');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('i2', 'запрет')),
      source: 'websocket',
    });
    harness.openNotifications();
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'NOTIFICATIONS',
    );
    assert.deepEqual(selectReturnOwner(harness.store.getState()), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), 'incoming:i2');
    pass('4. Open with ready item → NOTIFICATIONS + return + one active');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('i3', 'текст карточки')),
      source: 'websocket',
    });
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('i4', 'второй')),
      source: 'websocket',
    });
    harness.openNotifications();
    const view = presentNotificationsState(
      harness.notificationsController.getState(),
    );
    assert.equal(view.phase, 'ITEM');
    if (view.phase === 'ITEM') {
      assert.equal(view.itemId, 'incoming:i3');
      assert.match(view.senderLabel, /anna/i);
      assert.match(view.text, /текст карточки/);
    }
    pass('5. Presenter renders only the active item');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('a1')),
      source: 'websocket',
    });
    harness.openNotifications();
    const activeBefore = selectActiveItemId(harness.runtimeStore.getState());
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('a2')),
      source: 'websocket',
    });
    assert.equal(
      selectActiveItemId(harness.runtimeStore.getState()),
      activeBefore,
    );
    assert.equal(harness.runtimeStore.getState().items.queue.length, 2);
    assert.equal(selectReadyHeadId(harness.runtimeStore.getState()), 'incoming:a1');
    pass('6. New item while active → active identity stable; FIFO grows');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('d1')),
      source: 'websocket',
    });
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('d2')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.domainPorts.NOTIFICATIONS.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
    });
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), 'incoming:d1');
    assert.equal(harness.runtimeStore.getState().items.queue.length, 2);
    pass('7. Duplicate activate does not claim another item');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('r1')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.dispatchDomainIntent({
      domain: 'NOTIFICATIONS',
      intent: {
        type: 'ITEM_ACTION_REQUESTED',
        action: { type: 'DISMISS' },
      },
    });
    assert.equal(
      harness.calls.some((c) => c.startsWith('notifications:')),
      true,
    );
    pass('8. Domain action while NOTIFICATIONS owns → Notifications port');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent({
      domain: 'NOTIFICATIONS',
      intent: { type: 'ACTIVATE_READY_ITEM_REQUESTED' },
    });
    assert.equal(
      harness.violations[0]?.code,
      'DOMAIN_INTENT_NOT_CURRENT_OWNER',
    );
    pass('9. Notifications intent while CREATE_BAN owns → rejected');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('x1')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.dispatchDomainIntent({
      domain: 'CREATE_BAN',
      intent: { type: 'COMPOSE_REQUESTED' },
    });
    assert.equal(
      harness.violations.some((v) => v.code === 'DOMAIN_INTENT_NOT_CURRENT_OWNER'),
      true,
    );
    harness.dispatchDomainIntent({
      domain: 'SETTINGS',
      intent: {
        type: 'NOTIFICATION_PREFERENCE_CHANGED',
        preference: 'NORMAL',
      },
    });
    assert.equal(
      harness.violations.filter((v) => v.code === 'DOMAIN_INTENT_NOT_CURRENT_OWNER')
        .length >= 2,
      true,
    );
    pass('10. CreateBan/Settings intent while NOTIFICATIONS owns → rejected');
  }

  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('b1')),
      source: 'websocket',
    });
    store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd1',
      targetItemId: 'incoming:b1',
      action: 'incoming_overboard',
      source: 'user',
    });
    const cap = mapNotificationsCapability(store.getState());
    assert.equal(cap.transition, 'BLOCKED');
    if (cap.transition === 'BLOCKED') {
      assert.equal(cap.reason, 'NOTIFICATION_ACTION_IN_PROGRESS');
    }
    pass('11. Action submission → capability BLOCKED');
  }

  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('b2')),
      source: 'websocket',
    });
    store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd2',
      targetItemId: 'incoming:b2',
      action: 'incoming_overboard',
      source: 'user',
    });
    const switchResult = decideOwnerSwitch({
      currentOwner: { type: 'DOMAIN', domain: 'NOTIFICATIONS' },
      currentCapability: mapNotificationsCapability(store.getState()),
      request: { target: 'CREATE_BAN', reason: 'USER_INTENT' },
    });
    assert.equal(switchResult.decision.type, 'KEEP_CURRENT');
    assert.equal(switchResult.decisionClass, 'BLOCKED');
    pass('12. Owner switch while action BLOCKED → stays NOTIFICATIONS');
  }

  {
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('f1')),
      source: 'websocket',
    });
    store.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED', source: 'user' });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmdf',
      targetItemId: 'incoming:f1',
      action: 'incoming_overboard',
      source: 'user',
    });
    store.dispatch({
      type: 'CARD_ACTION_FAILED',
      commandId: 'cmdf',
      targetItemId: 'incoming:f1',
      errorCode: 'NETWORK',
      source: 'user',
    });
    assert.equal(selectActiveItemId(store.getState()), 'incoming:f1');
    assert.equal(store.getState().items.queue.length, 1);
    assert.equal(store.getState().action.status, 'failed');
    const view = presentNotificationsState({
      activation: { type: 'ACTIVE', itemId: 'incoming:f1' },
      activeItem: {
        kind: 'incoming',
        itemId: 'incoming:f1',
        senderLabel: '@anna',
        text: 'текст',
      },
      actionStatus: 'failed',
      actionErrorCode: 'NETWORK',
      lastActivationOutcome: null,
    });
    assert.equal(view.phase, 'ITEM');
    if (view.phase === 'ITEM') {
      assert.equal(view.actionStatus, 'ERROR');
    }
    pass('13. Action failure preserves active item + presentable error');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('c1')),
      source: 'websocket',
    });
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('c2')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.runtimeStore.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 't-complete',
      targetItemId: 'incoming:c1',
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), null);
    assert.equal(selectReadyHeadId(harness.runtimeStore.getState()), 'incoming:c2');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    assert.equal(selectReturnOwner(harness.store.getState()), null);
    pass('14-16. Complete once; remaining stays ready; release to prior owner');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    harness.dispatchDomainIntent({
      domain: 'CREATE_BAN',
      intent: { type: 'COMPOSE_REQUESTED' },
    });
    assert.equal(harness.productController.getState().route, 'WHO');
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('s1')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.store.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
    assert.equal(harness.productController.getState().route, 'WHO');
    pass('17. CreateBan state survives Notifications ownership');
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
    // Return to CREATE_BAN, then open notifications from CREATE_BAN
    harness.store.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('s2')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.store.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
    assert.equal(
      harness.settingsController.getState().notificationPreference,
      'NORMAL',
    );
    pass('18. Settings state survives Notifications ownership');
  }

  {
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    const ownerBefore = selectCurrentOwner(harness.store.getState());
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('n1')),
      source: 'websocket',
    });
    assert.deepEqual(selectCurrentOwner(harness.store.getState()), ownerBefore);
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), null);
    pass('19-20. Arrival never switches owner; no active without activation');
  }

  {
    assert.equal(
      mapNotificationsAvailability(
        createNotificationRuntimeStore().getState(),
      ).availability,
      'UNAVAILABLE',
    );
    const store = createNotificationRuntimeStore();
    receiveNotificationItem(store, {
      item: itemFromIncoming(ban('av1')),
      source: 'websocket',
    });
    assert.equal(mapNotificationsAvailability(store.getState()).availability, 'AVAILABLE');
    pass('Availability: empty UNAVAILABLE; ready item AVAILABLE');
  }

  {
    const mapped = mapNotificationsUiEvent({ type: 'CLOSE_PRESSED' });
    assert.deepEqual(mapped, {
      kind: 'APPLICATION',
      intent: 'NOTIFICATIONS_RELEASE_REQUESTED',
    });
    const accept = mapNotificationsUiEvent({
      type: 'ACTION_PRESSED',
      actionId: 'ACCEPT',
    });
    assert.equal(accept.kind, 'DOMAIN');
    pass('Presenter UI event mapping');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /owner\.domain === 'NOTIFICATIONS'/);
    assert.match(surface, /NotificationsSurface/);
    assert.doesNotMatch(surface, /hidden|aria-hidden|overlay/);
    pass('Exclusive presentation mount for NOTIFICATIONS');
  }

  {
    const policy = readFileSync(
      join(webSrc, 'app-coordinator/application-policy.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      policy,
      /\bqueue\b|\breadyHead\b|\bactiveItem\b|\bREAL_TIME\b|\bNORMAL\b|\bnotificationMode\b|\boverlay\b|\bWebSocket\b|\bpending\b|\bsender\b/,
    );
    assert.doesNotMatch(policy, /NOTIFICATIONS/);
    pass('Pure Policy has no Notifications/queue branches');
  }

  {
    const runtimeCore = [
      'notification-runtime.types.ts',
      'notification-runtime.reducer.ts',
      'notification-runtime.selectors.ts',
      'notification-runtime.store.ts',
      'notification-runtime.intents.ts',
      'notification-runtime.effects.ts',
    ];
    for (const f of runtimeCore) {
      const src = readFileSync(join(webSrc, 'notification-runtime', f), 'utf8');
      assert.doesNotMatch(
        src,
        /from ['"]@\/product-flow|from ['"]@\/settings|from ['"]react['"]/,
      );
      assert.doesNotMatch(
        src,
        /\bcurrentOwner\b|\breturnOwner\b|ApplicationSurface/,
      );
    }
    const notifDir = join(webSrc, 'notifications');
    for (const f of [
      'notifications.types.ts',
      'notifications.capability.ts',
      'notifications.availability.ts',
      'notifications.controller.ts',
      'notifications.selectors.ts',
    ]) {
      const src = readFileSync(join(notifDir, f), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/product-flow|from ['"]@\/settings/);
      assert.doesNotMatch(src, /from ['"]react['"]|from ['"]@\/app-coordinator/);
      assert.doesNotMatch(src, /\bcurrentOwner\b|\breturnOwner\b/);
    }
    const presenter = readFileSync(
      join(notifDir, 'presentation/notifications.presenter.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      presenter,
      /notification-runtime\.(store|reducer|controller)|app-coordinator|create-ban|settings\.controller/,
    );
    const ui = readFileSync(
      join(notifDir, 'presentation/NotificationsScreen.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      ui,
      /notification-runtime|notifications\.controller|app-coordinator|domain-ports|fetch\(/,
    );
    pass('Source guards: Runtime / domain / presenter / UI');
  }

  {
    assert.equal(
      existsSync(join(webSrc, 'notifications/notifications.controller.ts')),
      true,
    );
    assert.equal(
      existsSync(
        join(webSrc, 'notifications/presentation/NotificationsScreen.tsx'),
      ),
      true,
    );
    const owner = readFileSync(
      join(webSrc, 'app-coordinator/application-owner.ts'),
      'utf8',
    );
    assert.match(owner, /NOTIFICATIONS/);
    const lobby = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.match(lobby, /Уведомления/);
    assert.match(lobby, /onOpenNotifications/);
    assert.doesNotMatch(lobby, /OPEN_NOTIFICATIONS|NOTIFICATIONS/);
    pass('NOTIFICATIONS registered with Runtime+Port+presenter+UI; Lobby CTA');
  }

  {
    const settings = readFileSync(
      join(webSrc, 'settings/settings.controller.ts'),
      'utf8',
    );
    const notifCtrl = readFileSync(
      join(webSrc, 'notifications/notifications.controller.ts'),
      'utf8',
    );
    assert.doesNotMatch(settings, /notification-runtime|notifications\./);
    assert.doesNotMatch(notifCtrl, /settings\.|notificationPreference|REAL_TIME/);
    pass('Settings preference remains disconnected from Notifications');
  }

  {
    // No automatic queue drain: after complete, second item stays inactive
    const harness = createHarness();
    harness.runtimeSink.bootCompleted();
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('q1')),
      source: 'websocket',
    });
    receiveNotificationItem(harness.runtimeStore, {
      item: itemFromIncoming(ban('q2')),
      source: 'websocket',
    });
    harness.openNotifications();
    harness.runtimeStore.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 't-drain',
      targetItemId: 'incoming:q1',
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.equal(selectActiveItemId(harness.runtimeStore.getState()), null);
    assert.equal(selectReadyHeadId(harness.runtimeStore.getState()), 'incoming:q2');
    assert.equal(
      selectApplicationSurfaceOwner(harness.store.getState()),
      'CREATE_BAN',
    );
    pass('No automatic queue drain / next-item activation');
  }

  {
    const c = createNotificationsController({
      store: createNotificationRuntimeStore(),
      getToken: () => null,
    });
    const a = c.getState();
    const b = c.getState();
    assert.equal(a.activation.type, b.activation.type);
    pass('Stable Notifications domain snapshots');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
