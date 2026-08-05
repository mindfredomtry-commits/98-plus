/**
 * Stage 8 Phase 9E — production composition: cold HTTP Sync → OPEN → Ban1 visible.
 *
 * Uses real Mapper + Runtime store + domain availability + coordinator open + presenter.
 * HTTP is stubbed with a Contract V1 SNAPSHOT (revision=2, Ban1/Ban2) — the broken boundary.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9e-cold-sync-composition.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NotificationsDeltaV1 } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  applyNotificationsDeltaToStore,
  runNotificationsSyncViaMapper,
} from '../src/notification-runtime/notifications-mapper';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import {
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'cmpiebpwt00rgpk0p87dyblug';
const BAN1 = 'ban1phase9e';
const BAN2 = 'ban2phase9e';
const webSrc = join(__dirname, '../src');

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'https://98plusapi-production.up.railway.app';

const snapshot = fixtureSnapshot({
  revision: '2',
  items: [
    fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
    fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
  ],
});

const origFetch = globalThis.fetch;

async function main() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /\/notifications\/sync$/);
    const headers = init?.headers as Record<string, string> | undefined;
    const auth =
      headers?.Authorization ??
      headers?.authorization ??
      (headers ? Object.values(headers).find((v) => String(v).startsWith('Bearer ')) : null);
    assert.ok(auth && String(auth).startsWith('Bearer '), 'Authorization Bearer required');
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  {
    const store = createNotificationRuntimeStore();
    assert.equal(store.getState().revision, null);
    assert.equal(store.getState().syncStatus, 'UNINITIALIZED');

    const result = await runNotificationsSyncViaMapper(store, {
      token: 'test-token-phase9e',
    });
    assert.equal(result.ok, true);
    assert.equal(store.getState().syncStatus, 'READY');
    assert.equal(store.getState().revision, '2');
    assert.deepEqual([...store.getState().passiveItemIds], [
      `incoming:${BAN1}`,
      `incoming:${BAN2}`,
    ]);
    assert.equal(store.getState().activeItemId, null);
    assert.ok(store.getState().presentationByItemId[`incoming:${BAN1}`]);
    assert.ok(store.getState().presentationByItemId[`incoming:${BAN2}`]);
    assert.equal(
      mapNotificationsAvailability(store.getState()).availability,
      'AVAILABLE',
    );
    pass('cold revision=null → HTTP SNAPSHOT rev=2 → READY + AVAILABLE');

    const life = createAppCoordinatorLifecycle({
      runtimeStore: store,
      getToken: () => 'test-token-phase9e',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    life.runtimePort.notifyBootCompleted();
    life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });

    assert.equal(life.store.getState().currentOwner.type, 'DOMAIN');
    if (life.store.getState().currentOwner.type === 'DOMAIN') {
      assert.equal(life.store.getState().currentOwner.domain, 'NOTIFICATIONS');
    }
    assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
    assert.equal(store.getState().passiveItemIds[0], `incoming:${BAN2}`);

    const domain = life.notificationsController.getState();
    assert.equal(domain.activation.type, 'ACTIVE');
    assert.equal(domain.activeItem?.itemId, `incoming:${BAN1}`);
    const view = presentNotificationsState(domain);
    assert.equal(view.phase, 'ITEM');
    if (view.phase === 'ITEM') {
      assert.equal(view.itemId, `incoming:${BAN1}`);
      assert.ok(view.text.length > 0);
    }
    life.dispose();
    pass('OPEN → active Ban1 → presenter ITEM visible');
  }

  {
    // Proven live gap: delta before snapshot cannot apply; REQUEST_FULL_SYNC required.
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'SYNC_STARTED',
      transitionId: 't-gap',
      source: 'bootstrap',
    });
    const delta: NotificationsDeltaV1 = {
      type: 'DELTA',
      fromRevision: '0',
      revision: '1',
      operations: [
        {
          type: 'UPSERT_ITEM',
          revision: '1',
          item: fixtureContractIncoming({
            banId: BAN1,
            userId: USER,
            sequence: '1',
          }),
        },
      ],
    };
    applyNotificationsDeltaToStore(store, { delta, source: 'websocket' });
    assert.equal(store.getState().revision, null);
    assert.equal(store.getState().lastConflict?.type, 'REVISION_GAP');
    assert.ok(
      store.getLastEffects().some((e) => e.type === 'REQUEST_FULL_SYNC'),
    );
    pass('WS delta with revision=null → REVISION_GAP + REQUEST_FULL_SYNC');

    // Equivalent to transport effect sink:
    // force full SNAPSHOT recovery, then OPEN should activate Ban1.
    const result = await runNotificationsSyncViaMapper(store, {
      token: 'test-token-phase9e',
      recovery: false,
      afterRevision: null,
    });
    assert.equal(result.ok, true);
    assert.equal(store.getState().syncStatus, 'READY');
    assert.equal(store.getState().revision, '2');

    const life = createAppCoordinatorLifecycle({
      runtimeStore: store,
      getToken: () => 'test-token-phase9e',
      onboard: async () => {},
      refreshUser: async () => {},
    });
    life.runtimePort.notifyBootCompleted();
    life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    assert.equal(store.getState().activeItemId, `incoming:${BAN1}`);
    life.dispose();
    pass('WS gap → REQUEST_FULL_SYNC → full SNAPSHOT → OPEN Ban1');
  }

  {
    const transport = readFileSync(
      join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
      'utf8',
    );
    assert.match(transport, /REQUEST_FULL_SYNC/);
    assert.match(transport, /beginSyncFlight|latchPendingFullSync/);
    assert.match(transport, /applied\.effects/);
    assert.doesNotMatch(transport, /store\.getLastEffects\(\)/);
    assert.doesNotMatch(transport, /reason !== 'reconnect'/);
    assert.doesNotMatch(transport, /effects handled by controller/);
    pass('transport drains REQUEST_FULL_SYNC via single-flight full snapshot sync');
  }

  {
    const mapper = readFileSync(
      join(webSrc, 'notification-runtime/notifications-mapper.ts'),
      'utf8',
    );
    assert.match(mapper, /SYNC_APPLY_NOT_READY|syncStatus !== 'READY'/);
    assert.match(mapper, /__NOTIFICATIONS_SYNC_DIAG__|notifications-sync-diag/);
    assert.match(mapper, /notificationMode: 'real-time'/);
    assert.doesNotMatch(mapper, /source: input\.source \?\? 'ws'/);
    pass('mapper fails closed when apply leaves non-READY; diag + websocket source');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = origFetch;
    if (process.exitCode !== 1) {
      console.log(`\n${passed} passed\n`);
    }
  });
