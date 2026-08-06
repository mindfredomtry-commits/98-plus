/**
 * Stage 8 Phase 9H — production-equivalent Notifications open path harness.
 *
 * Starts from the real Lobby CTA (“Твои запреты”) through ApplicationSurface,
 * Coordinator.openNotifications(), Runtime activation, Presenter, and a real
 * React mount of NotificationsSurface. Mocks only HTTP sync transport.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9h-production-open-path.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { UserPublic } from '@98plus/shared';
import { createAppCoordinatorLifecycle } from '../src/app-coordinator/app-coordinator.lifecycle';
import { ApplicationSurface } from '../src/app-coordinator/ApplicationSurface';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { runNotificationsSyncViaMapper } from '../src/notification-runtime/notifications-mapper';
import {
  getNotificationsSyncDiagLedger,
  resetNotificationsSyncDiag,
  type NotificationsSyncDiagStage,
} from '../src/notification-runtime/notifications-sync-diag';
import { mapNotificationsAvailability } from '../src/notifications/notifications.availability';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import type { NotificationsSessionCompleteMeta } from '../src/notifications/notifications.open-types';
import {
  fixtureContractIncoming,
  fixtureRemoveThenUpsertDelta,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';

const USER = 'cmpiebpwt00rgpk0p87dyblug';
const BAN1 = 'Ban1';
const BAN2 = 'Ban2';
const ITEM1 = `incoming:${BAN1}`;
const ITEM2 = `incoming:${BAN2}`;

const TEST_USER: UserPublic = {
  id: USER,
  telegramId: '1',
  username: 'u',
  firstName: 'U',
  lastName: null,
  avatarUrl: null,
  photoUrl: null,
  energyPercent: 50,
  streak: 0,
  isOnboarded: true,
  aura: 'stable',
  auraLabel: 'Контакт',
  notificationMode: 'real-time',
};

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

function installDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost/' },
  );
  const win = dom.window;
  const define = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  define('window', win);
  define('document', win.document);
  define('navigator', win.navigator);
  define('HTMLElement', win.HTMLElement);
  define('Node', win.Node);
  define('Text', win.Text);
  define('MutationObserver', win.MutationObserver);
  define('IS_REACT_ACT_ENVIRONMENT', true);
  return dom;
}

function ownerDomain(
  life: ReturnType<typeof createAppCoordinatorLifecycle>,
): string {
  const o = life.store.getState().currentOwner;
  return o.type === 'DOMAIN' ? o.domain : o.type;
}

function clickYourBans(container: Element) {
  const btn = container.querySelector(
    '[data-testid="product-lobby-your-bans"]',
  ) as HTMLButtonElement | null;
  assert.ok(btn, 'Lobby CTA “Твои запреты” must exist');
  assert.equal(btn.textContent?.trim(), 'Твои запреты');
  btn.click();
}

function clickClose(container: Element) {
  const btn = container.querySelector(
    '[data-testid="notifications-close"]',
  ) as HTMLButtonElement | null;
  assert.ok(btn, 'Close button must exist');
  btn.click();
}

function assertBan1Visible(
  container: Element,
  life: ReturnType<typeof createAppCoordinatorLifecycle>,
) {
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  const screen = container.querySelector(
    '[data-testid="notifications-screen"][data-phase="ITEM"]',
  );
  assert.ok(screen, 'ITEM screen must be mounted');
  assert.equal(screen.getAttribute('data-item-id'), ITEM1);
  const view = presentNotificationsState(
    life.notificationsController.getState(),
  );
  assert.equal(view.phase, 'ITEM');
  if (view.phase === 'ITEM') assert.equal(view.itemId, ITEM1);
}

function countSessionCompletes() {
  return getNotificationsSyncDiagLedger().filter(
    (e) => e.stage === 'RUNTIME_SESSION_COMPLETE',
  ).length;
}

async function main() {
  resetNotificationsSyncDiag();
  const dom = installDom();
  const container = document.getElementById('root')!;
  let root: Root | null = null;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /\/notifications\/sync$/);
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // —— Test 9: single Lobby CTA (source) ——
  {
    const lobbySrc = readFileSync(
      join(process.cwd(), 'apps/web/src/product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.match(lobbySrc, /data-testid="product-lobby-your-bans"/);
    assert.match(lobbySrc, /Твои запреты/);
    assert.doesNotMatch(lobbySrc, /Уведомления/);
    assert.doesNotMatch(lobbySrc, /product-lobby-notifications/);
    assert.doesNotMatch(lobbySrc, /product-lobby-bans/);
    const appSrc = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(appSrc, /lifecycle\.openNotifications/);
    assert.doesNotMatch(
      appSrc,
      /lifecycle\.dispatch\(\{\s*type:\s*'OPEN_NOTIFICATIONS_REQUESTED'/,
    );
    pass('Test 9 — single Lobby CTA “Твои запреты”; openNotifications only');
  }

  // —— Test 10: production import graph ——
  {
    const appSrc = readFileSync(
      join(process.cwd(), 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
      'utf8',
    );
    assert.match(
      appSrc,
      /from '@\/notifications\/presentation\/NotificationsSurface'/,
    );
    assert.match(
      appSrc,
      /from '@\/notifications\/presentation\/notifications\.presenter'/,
    );
    assert.match(
      appSrc,
      /from '@\/app-coordinator\/app-coordinator\.lifecycle'/,
    );
    pass(
      'Test 10 — ApplicationSurface imports rebuilt Coordinator/Presenter/Surface',
    );
  }

  const store = createNotificationRuntimeStore();
  const sync = await runNotificationsSyncViaMapper(store, {
    token: 'test-token-phase9h',
  });
  assert.equal(sync.ok, true);
  assert.deepEqual([...store.getState().passiveItemIds], [ITEM1, ITEM2]);

  let releaseCount = 0;

  const life = createAppCoordinatorLifecycle({
    runtimeStore: store,
    getToken: () => 'test-token-phase9h',
    onboard: async () => {},
    refreshUser: async () => {},
  });
  life.runtimePort.notifyBootCompleted();

  const origStoreDispatch = life.store.dispatch.bind(life.store);
  (life.store as { dispatch: typeof life.store.dispatch }).dispatch = ((
    event,
  ) => {
    if (event.type === 'NOTIFICATIONS_RELEASE_REQUESTED') {
      releaseCount += 1;
    }
    return origStoreDispatch(event);
  }) as typeof life.store.dispatch;

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(ApplicationSurface, {
        lifecycle: life,
        loading: false,
        user: TEST_USER,
        getToken: () => 'test-token-phase9h',
      }),
    );
  });

  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.equal(ownerDomain(life), 'CREATE_BAN');
  assert.ok(
    container.querySelector('[data-testid="product-lobby-your-bans"]'),
    'Lobby CTA visible',
  );
  assert.equal(
    container.querySelectorAll('[data-testid="product-lobby-your-bans"]')
      .length,
    1,
  );

  // —— Test 1: first open ——
  resetNotificationsSyncDiag();
  const sessionsAtStart = countSessionCompletes();
  await act(async () => {
    clickYourBans(container);
  });
  assertBan1Visible(container, life);
  const gen1 = life.notificationsController.getState().activationGeneration;
  const session1 =
    life.notificationsController.getState().presentationSessionGeneration;
  assert.ok(gen1 >= 1);
  assert.ok(session1 >= 1);
  const remount1 = container
    .querySelector('[data-remount-key]')
    ?.getAttribute('data-remount-key');
  pass('Test 1 — first open → Owner NOTIFICATIONS → Ban1 visible');

  // —— Test 2: Close preserves Ban1 ——
  await act(async () => {
    clickClose(container);
  });
  assert.equal(ownerDomain(life), 'CREATE_BAN');
  assert.ok(
    container.querySelector('[data-testid="product-lobby-your-bans"]'),
  );
  assert.equal(store.getState().activeItemId, null);
  assert.deepEqual([...store.getState().passiveItemIds], [ITEM1, ITEM2]);
  assert.ok(store.getState().itemsById[ITEM1]);
  assert.equal(
    mapNotificationsAvailability(store.getState()).availability,
    'AVAILABLE',
  );
  assert.equal(releaseCount, 1);
  assert.equal(countSessionCompletes() - sessionsAtStart, 1);
  pass('Test 2 — Close → Lobby; Ban1 UNPROCESSED in FIFO; one RELEASE');

  // —— Test 3 + 7: same-item second open + remount key ——
  await act(async () => {
    clickYourBans(container);
  });
  assertBan1Visible(container, life);
  const gen2 = life.notificationsController.getState().activationGeneration;
  const session2 =
    life.notificationsController.getState().presentationSessionGeneration;
  assert.ok(gen2 > gen1);
  assert.ok(session2 > session1);
  const remount2 = container
    .querySelector('[data-remount-key]')
    ?.getAttribute('data-remount-key');
  assert.equal(remount2, `${session2}:${gen2}:${ITEM1}`);
  assert.notEqual(remount2, remount1);
  pass('Test 3 — second open Ban1; generations increased');
  pass('Test 7 — new remount key for Ban1 generation N+1');

  // —— Test 4: repeatability ×10 ——
  await act(async () => {
    clickClose(container);
  });
  const releasesBeforeLoop = releaseCount;
  const sessionsBeforeLoop = countSessionCompletes();
  let prevSession =
    life.notificationsController.getState().presentationSessionGeneration;
  let prevActivation =
    life.notificationsController.getState().activationGeneration;

  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      clickYourBans(container);
    });
    assertBan1Visible(container, life);
    const s =
      life.notificationsController.getState().presentationSessionGeneration;
    const a = life.notificationsController.getState().activationGeneration;
    assert.ok(s > prevSession, `session gen must increase (cycle ${i})`);
    assert.ok(a > prevActivation, `activation gen must increase (cycle ${i})`);
    prevSession = s;
    prevActivation = a;
    assert.deepEqual([...store.getState().passiveItemIds], [ITEM2]);
    await act(async () => {
      clickClose(container);
    });
    assert.equal(ownerDomain(life), 'CREATE_BAN');
    assert.deepEqual([...store.getState().passiveItemIds], [ITEM1, ITEM2]);
  }
  assert.equal(releaseCount - releasesBeforeLoop, 10);
  assert.equal(countSessionCompletes() - sessionsBeforeLoop, 10);
  pass('Test 4 — 10× Open→Close Ban1; one SESSION_COMPLETE + RELEASE each');

  // —— Test 5: no stale release ——
  await act(async () => {
    clickYourBans(container);
  });
  assertBan1Visible(container, life);
  const liveSession =
    life.notificationsController.getState().presentationSessionGeneration;
  const releasesBeforeStale = releaseCount;
  const inject = (
    life as unknown as {
      __testInjectSessionComplete: (
        meta: NotificationsSessionCompleteMeta,
      ) => void;
    }
  ).__testInjectSessionComplete;
  inject({
    presentationSessionGeneration: liveSession - 1,
    reason: 'close',
  });
  assertBan1Visible(container, life);
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  assert.equal(releaseCount, releasesBeforeStale);
  assert.ok(
    getNotificationsSyncDiagLedger().some(
      (e) => e.stage === 'STALE_SESSION_COMPLETE_IGNORED',
    ),
  );
  pass('Test 5 — stale older session cannot release live Ban1 session');

  // —— Test 8: ApplicationSurface invariant ——
  await act(async () => {
    life.dispatchDomainIntent({
      domain: 'NOTIFICATIONS',
      intent: { type: 'CLEAR_ACTIVATION_REQUESTED' },
    });
  });
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  assert.ok(
    container.querySelector('[data-testid="notifications-owner-invariant"]'),
    'invariant surface must render',
  );
  assert.equal(
    container.querySelector('[data-testid="product-lobby-your-bans"]'),
    null,
    'must not silently render Lobby',
  );
  pass('Test 8 — Owner NOTIFICATIONS + EMPTY → invariant; no Lobby fallback');

  await act(async () => {
    life.dispatch({ type: 'NOTIFICATIONS_RELEASE_REQUESTED' });
  });

  // —— Test 6: domain processing advances FIFO ——
  // After Test 8 we RELEASE to Lobby with Ban1/Ban2 still present.
  assert.equal(ownerDomain(life), 'CREATE_BAN');
  assert.ok(store.getState().itemsById[ITEM1]);
  assert.ok(store.getState().itemsById[ITEM2]);

  // Server-confirmed domain decision while Ban1 is passive (not active claim).
  const rev = store.getState().revision ?? '2';
  const nextRev = String(Number(rev) + 1);
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: 'domain-ban1-done',
    delta: fixtureRemoveThenUpsertDelta({
      fromRevision: rev,
      removeItemId: ITEM1,
      removeRevision: nextRev,
    }),
    source: 'test',
  });
  assert.equal(
    store.getState().itemsById[ITEM1],
    undefined,
    'Ban1 must be removed after domain delta',
  );
  assert.ok(store.getState().itemsById[ITEM2]);
  assert.deepEqual([...store.getState().passiveItemIds], [ITEM2]);

  await act(async () => {
    clickYourBans(container);
  });
  assert.equal(ownerDomain(life), 'NOTIFICATIONS');
  const viewAfter = presentNotificationsState(
    life.notificationsController.getState(),
  );
  assert.equal(viewAfter.phase, 'ITEM');
  if (viewAfter.phase === 'ITEM') {
    assert.equal(viewAfter.itemId, ITEM2);
  }
  const screen2 = container.querySelector(
    '[data-testid="notifications-screen"][data-phase="ITEM"]',
  );
  assert.equal(screen2?.getAttribute('data-item-id'), ITEM2);
  pass('Test 6 — after Ban1 domain REMOVE, next open activates Ban2');

  // Diag open-path stage order
  resetNotificationsSyncDiag();
  await act(async () => {
    clickClose(container);
  });
  await act(async () => {
    clickYourBans(container);
  });
  const stages = getNotificationsSyncDiagLedger().map((e) => e.stage);
  const requiredOrder: NotificationsSyncDiagStage[] = [
    'LOBBY_CTA_CLICK',
    'COORDINATOR_OPEN_BEGIN',
    'COORDINATOR_CAPABILITY',
    'RUNTIME_SESSION_BEGIN',
    'RUNTIME_ACTIVATE_BEGIN',
    'RUNTIME_ACTIVATE_RESULT',
    'PRESENTER_SNAPSHOT',
    'COORDINATOR_OWNER_COMMIT',
  ];
  let searchFrom = 0;
  for (const stage of requiredOrder) {
    const idx = stages.indexOf(stage, searchFrom);
    assert.ok(idx >= 0, `missing stage ${stage} in ${stages.join(',')}`);
    searchFrom = idx + 1;
  }
  pass('Diag open-path stage order');

  await act(async () => {
    root?.unmount();
  });
  life.dispose();
  dom.window.close();
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
