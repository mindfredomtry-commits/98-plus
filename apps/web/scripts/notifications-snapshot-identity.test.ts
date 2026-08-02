/**
 * Stage 8 Phase 5 hotfix — Notifications useSyncExternalStore snapshot identity.
 *
 * React #185 (Maximum update depth exceeded) when getSnapshot returns a new
 * object on every call.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-snapshot-identity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import { createNotificationsController } from '../src/notifications/notifications.controller';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  itemFromIncoming,
  receiveNotificationItem,
} from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string): BanInteraction {
  return {
    id,
    text: 'запрет',
    sender: { id: 's1', firstName: 'Анна', username: 'anna' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

const webSrc = join(process.cwd(), 'apps/web/src');

{
  const runtimeStore = createNotificationRuntimeStore();
  const controller = createNotificationsController({
    store: runtimeStore,
    getToken: () => null,
  });

  receiveNotificationItem(runtimeStore, {
    item: itemFromIncoming(ban('snap1')),
    source: 'websocket',
  });

  const a = controller.getState();
  const b = controller.getState();
  const c = controller.getState();
  assert.equal(Object.is(a, b), true);
  assert.equal(Object.is(b, c), true);
  pass('1-3. Repeated getState after ingest is referentially stable');
}

{
  const runtimeStore = createNotificationRuntimeStore();
  const controller = createNotificationsController({
    store: runtimeStore,
    getToken: () => null,
  });

  receiveNotificationItem(runtimeStore, {
    item: itemFromIncoming(ban('snap2')),
    source: 'websocket',
  });

  // Wait for store→controller emit from ingest to settle on one cache entry.
  const before = controller.getState();
  assert.equal(before.activation.type, 'INACTIVE');

  controller.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });
  const after = controller.getState();
  assert.equal(Object.is(before, after), false);
  assert.equal(after.activation.type, 'ACTIVE');

  const after2 = controller.getState();
  const after3 = controller.getState();
  assert.equal(Object.is(after, after2), true);
  assert.equal(Object.is(after2, after3), true);
  pass('4-6. Activation replaces snapshot once; then stable');
}

{
  const runtimeStore = createNotificationRuntimeStore();
  const controller = createNotificationsController({
    store: runtimeStore,
    getToken: () => null,
  });
  receiveNotificationItem(runtimeStore, {
    item: itemFromIncoming(ban('snap3')),
    source: 'websocket',
  });
  controller.dispatch({ type: 'ACTIVATE_READY_ITEM_REQUESTED' });

  // Simulate useSyncExternalStore client + server snapshots.
  const clientSnap = controller.getState();
  const serverSnap = controller.getState();
  assert.equal(Object.is(clientSnap, serverSnap), true);

  // Presenter ViewState is derived per render — must NOT be the external snapshot.
  const view1 = presentNotificationsState(clientSnap);
  const view2 = presentNotificationsState(clientSnap);
  assert.equal(Object.is(view1, view2), false);
  assert.notEqual(view1, clientSnap);
  pass('7-10. Server/client snapshots share identity; presenter is not the store snapshot');
}

{
  const controllerSrc = readFileSync(
    join(webSrc, 'notifications/notifications.controller.ts'),
    'utf8',
  );
  assert.match(controllerSrc, /cachedState/);
  assert.match(controllerSrc, /return cachedState/);
  assert.doesNotMatch(
    controllerSrc,
    /getState\(\)\s*\{\s*return project\(\)/,
  );

  const surfaceSrc = readFileSync(
    join(webSrc, 'notifications/presentation/NotificationsSurface.tsx'),
    'utf8',
  );
  assert.match(surfaceSrc, /useSyncExternalStore/);
  assert.match(surfaceSrc, /controller\.getState/);
  // ViewState is presented outside the external store snapshot.
  assert.match(surfaceSrc, /presentNotificationsState\(state\)/);
  pass('Source: cached snapshot + presenter outside useSyncExternalStore');
}

{
  // ProductFlow already caches; Settings returns reducer state by identity.
  const product = readFileSync(
    join(webSrc, 'product-flow/product-flow.controller.ts'),
    'utf8',
  );
  assert.match(product, /cachedProjection/);
  const settings = readFileSync(
    join(webSrc, 'settings/settings.controller.ts'),
    'utf8',
  );
  assert.match(settings, /return state;/);
  pass('CreateBan/Settings stores already use stable getState identity');
}

console.log(`\n${passed} passed\n`);
