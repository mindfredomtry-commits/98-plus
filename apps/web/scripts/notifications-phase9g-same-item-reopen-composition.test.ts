/**
 * Stage 8 Phase 9G — Close → same-itemId Ban1 reopen composition.
 *
 * Proves:
 * - single RELEASE producer (SESSION_COMPLETE sink only)
 * - activate-before-paint ordering
 * - same Ban1 identity + new activationGeneration
 * - surface-visible contract twice (presenter ITEM)
 * - no stale release after second OPEN
 * - no Journal REMOVE / no extra API
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9g-same-item-reopen-composition.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { runNotificationsSyncViaMapper } from '../src/notification-runtime/notifications-mapper';
import {
  resetNotificationsSyncDiag,
  getNotificationsSyncDiagLedger,
} from '../src/notification-runtime/notifications-sync-diag';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
} from '../src/notifications/presentation/notifications.presenter';
import {
  fixtureContractIncoming,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'cmpiebpwt00rgpk0p87dyblug';
const BAN1 = 'Ban1';
const BAN2 = 'Ban2';
const ITEM1 = `incoming:${BAN1}`;
const ITEM2 = `incoming:${BAN2}`;

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

process.env.NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'https://98plusapi-production.up.railway.app';
process.env.NOTIFICATIONS_SYNC_DIAG = '1';

const snapshot = fixtureSnapshot({
  revision: '2',
  items: [
    fixtureContractIncoming({ banId: BAN1, userId: USER, sequence: '1' }),
    fixtureContractIncoming({ banId: BAN2, userId: USER, sequence: '2' }),
  ],
});

const origFetch = globalThis.fetch;
let apiCallCount = 0;

/** Exact Surface CLOSE path after presenter maps CLOSE → DOMAIN close. */
function surfaceClose(life: ReturnType<typeof createAppCoordinatorLifecycle>) {
  const mapped = mapNotificationsUiEvent({ type: 'CLOSE_PRESSED' });
  assert.equal(mapped.kind, 'DOMAIN');
  assert.equal(mapped.intent.type, 'ACTIVE_ITEM_CLOSE_REQUESTED');
  life.dispatchDomainIntent({
    domain: 'NOTIFICATIONS',
    intent: mapped.intent,
  });
}

function ownerDomain(
  life: ReturnType<typeof createAppCoordinatorLifecycle>,
): string {
  const o = life.store.getState().currentOwner;
  return o.type === 'DOMAIN' ? o.domain : o.type;
}

function assertSurfaceVisible(
  life: ReturnType<typeof createAppCoordinatorLifecycle>,
  itemId: string,
  minGeneration: number,
): number {
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  const domain = life.notificationsController.getState();
  assert.ok(domain.activationGeneration >= minGeneration);
  const view = presentNotificationsState(domain);
  assert.equal(view.phase, 'ITEM');
  if (view.phase === 'ITEM') assert.equal(view.itemId, itemId);
  return domain.activationGeneration;
}

async function main() {
  resetNotificationsSyncDiag();
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    apiCallCount += 1;
    const url = String(input);
    assert.match(url, /\/notifications\/sync$/);
    const headers = init?.headers as Record<string, string> | undefined;
    const auth =
      headers?.Authorization ??
      headers?.authorization ??
      (headers
        ? Object.values(headers).find((v) => String(v).startsWith('Bearer '))
        : null);
    assert.ok(auth && String(auth).startsWith('Bearer '));
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // Wiring: Screen remounts on activationGeneration (same itemId reopen).
  {
    const surfaceSrc = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/notifications/presentation/NotificationsSurface.tsx',
      ),
      'utf8',
    );
    assert.match(surfaceSrc, /key=\{state\.activationGeneration\}/);
    assert.doesNotMatch(surfaceSrc, /onReleaseNotifications\(\)/);
    pass('Surface keys Screen by activationGeneration; no dual release call');
  }

  const store = createNotificationRuntimeStore();
  const sync = await runNotificationsSyncViaMapper(store, {
    token: 'test-token-phase9g',
  });
  assert.equal(sync.ok, true);
  assert.deepEqual([...store.getState().passiveItemIds], [ITEM1, ITEM2]);
  const syncApiCalls = apiCallCount;
  pass('cold SNAPSHOT → Ban1/Ban2 passive');

  let releaseDispatches = 0;

  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'test-token-phase9g',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();

  const origStoreDispatch = life.store.dispatch.bind(life.store);
  (life.store as { dispatch: typeof life.store.dispatch }).dispatch = ((
    event,
  ) => {
    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
      releaseDispatches += 1;
    }
    return origStoreDispatch(event);
  }) as typeof life.store.dispatch;

  // —— First OPEN ——
  life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
  const gen1 = assertSurfaceVisible(life, ITEM1, 1);
  pass('OPEN → Ban1 visible (surface contract + generation)');

  {
    let listenerActive: string | null = 'unset';
    const unsub = life.store.subscribe((_s, _p, event) => {
      if (event.type === 'OPEN_NOTIFICATIONS_REQUESTED') {
        listenerActive = store.getState().activeItemId;
      }
    });
    surfaceClose(life);
    assert.equal(ownerDomain(life), 'CREATE_BAN');
    assert.equal(releaseDispatches, 1);
    pass('Close → exactly one RELEASE (SESSION_COMPLETE sink)');

    life.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
    unsub();
    assert.equal(listenerActive, ITEM1);
    pass(
      'second OPEN subscriber sees Ban1 already activated (activate-before-paint)',
    );
  }

  const gen2 = assertSurfaceVisible(life, ITEM1, gen1 + 1);
  assert.ok(gen2 > gen1);
  assert.deepEqual([...store.getState().passiveItemIds], [ITEM2]);
  pass('same itemId Ban1 visible again with new activationGeneration');

  const releasesAfterSecondOpen = releaseDispatches;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(releaseDispatches, releasesAfterSecondOpen);
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  assert.equal(store.getState().activeItemId, ITEM1);
  pass('no stale RELEASE after second OPEN');

  assert.ok(store.getState().itemsById[ITEM1]);
  assert.ok(store.getState().itemsById[ITEM2]);
  assert.ok(store.getState().presentationByItemId[ITEM1]);
  assert.equal(apiCallCount, syncApiCalls);
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  pass('Ban1 remains; no Journal REMOVE; no extra API');

  const ledger = getNotificationsSyncDiagLedger();
  const stages = new Set(ledger.map((e) => e.stage));
  for (const required of [
    'CLOSE_RUNTIME_DISPATCH_RESULT',
    'CLOSE_EFFECTS',
    'SESSION_COMPLETE_SINK',
    'RELEASE_EVENT_DISPATCHED',
    'ACTIVATE_EVENT_DISPATCHED',
    'ACTIVATE_EVENT_RESULT',
    'RUNTIME_AFTER_ACTIVATION',
  ] as const) {
    assert.ok(stages.has(required), `missing diag stage ${required}`);
  }
  pass('Phase 9G diag breadcrumbs present');

  const closeMapped = mapNotificationsUiEvent({ type: 'CLOSE_PRESSED' });
  assert.equal(closeMapped.kind, 'DOMAIN');
  pass('presenter Close → DOMAIN ACTIVE_ITEM_CLOSE_REQUESTED only');

  life.dispose();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = origFetch;
    delete process.env.NOTIFICATIONS_SYNC_DIAG;
    if (process.exitCode !== 1) {
      console.log(`\n${passed} passed\n`);
    }
  });
