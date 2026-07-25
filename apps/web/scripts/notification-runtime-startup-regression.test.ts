/**
 * Startup regression suite for the 37e4eb3 gray-screen fix.
 *
 * Confirmed production failure mode: Providers mounted a useLayoutEffect that
 * closed over `setNotificationChainTransitioning` before that const was
 * initialized → TDZ → error boundary → blank gray shell.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/scripts/notification-runtime-startup-regression.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  reconcileRuntimeQueuePresentation,
  resetReconcilePresentationIdempotencyForTests,
} from '../src/notification-runtime/notification-runtime.production-advance';
import { notificationRuntimeReducer } from '../src/notification-runtime/notification-runtime.reducer';
import {
  selectInteractiveLobbyChromeMayShow,
  selectLobbyMayShow,
  selectNotificationClaimsScreen,
  selectNotificationPresentationActive,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import type { NotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  createInitialNotificationRuntimeState,
  type NotificationItem,
  type NotificationRuntimeEvent,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

/** Store seeded with an arbitrary initial state (test-only forge). */
function storeFromState(
  initial: NotificationRuntimeState,
): NotificationRuntimeStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    getLastEffects: () => [],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(event: NotificationRuntimeEvent) {
      const result = notificationRuntimeReducer(state, event);
      state = result.state;
      for (const listener of listeners) listener();
      return result;
    },
  };
}

function orphanIdleQueue(
  items: NotificationItem[],
): NotificationRuntimeState {
  return {
    ...createInitialNotificationRuntimeState(),
    lifecycle: { status: 'idle', source: 'test', transitionId: null },
    items: { queue: items },
    display: { kind: null, payload: null, mode: 'normal' },
  };
}

function incompleteShowing(
  items: NotificationItem[],
): NotificationRuntimeState {
  return {
    ...createInitialNotificationRuntimeState(),
    lifecycle: { status: 'showing', source: 'test', transitionId: 't1' },
    items: { queue: items },
    display: { kind: 'incoming', payload: null, mode: 'normal' },
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  resetReconcilePresentationIdempotencyForTests();
  fn();
  passed += 1;
  console.log(`ok — ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  resetReconcilePresentationIdempotencyForTests();
  await fn();
  passed += 1;
  console.log(`ok — ${name}`);
}

async function main() {
  check('1 cold start empty runtime → Lobby chrome paintable', () => {
    const store = createNotificationRuntimeStore();
    const s = store.getState();
    assert.equal(s.lifecycle.status, 'idle');
    assert.equal(s.display.kind, null);
    assert.equal(s.items.queue.length, 0);
    assert.equal(selectNotificationClaimsScreen(s), false);
    assert.equal(selectOverlayVisible(s), false);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
    assert.equal(selectLobbyMayShow(s), true);
    assert.equal(
      reconcileRuntimeQueuePresentation(store, EMPTY_RUNTIME_LEGACY_SINKS),
      'noop',
    );
  });

  check('2 cold start queue empty display null → no blank shell claim', () => {
    const s = createInitialNotificationRuntimeState();
    assert.equal(selectNotificationPresentationActive(s), false);
    assert.equal(selectNotificationClaimsScreen(s), false);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
  });

  check('3 cold start restored queue display null → no sync dispatch loop', () => {
    const store = storeFromState(orphanIdleQueue([incoming('R1'), incoming('R2')]));
    const types: string[] = [];
    const orig = store.dispatch.bind(store);
    store.dispatch = ((event: NotificationRuntimeEvent) => {
      types.push(event.type);
      return orig(event);
    }) as NotificationRuntimeStore['dispatch'];

    const outcomes: string[] = [];
    for (let i = 0; i < 12; i++) {
      outcomes.push(
        reconcileRuntimeQueuePresentation(
          store,
          EMPTY_RUNTIME_LEGACY_SINKS,
          'startup-reconcile',
        ),
      );
    }
    assert.equal(outcomes[0], 'show-head');
    assert.ok(outcomes.slice(1).every((o) => o === 'presentation-active' || o === 'noop'));
    assert.equal(selectNotificationPresentationActive(store.getState()), true);
    // First settle may ITEMS_RECEIVED once; no repeated identical settle storm.
    const itemsReceived = types.filter((t) => t === 'ITEMS_RECEIVED').length;
    assert.ok(itemsReceived <= 1, `ITEMS_RECEIVED count=${itemsReceived}`);
  });

  check('4 failed materialize preserve-queue → bounded settle, no loop', () => {
    // Forge submitting + queue + null display so ITEMS_RECEIVED does not showHead,
    // then reconcile normalizes once (preserve queue). A follow-up tick may
    // show-head from idle — that is intentional, not a storm.
    const forged: NotificationRuntimeState = {
      ...createInitialNotificationRuntimeState(),
      lifecycle: {
        status: 'submitting',
        source: 'test',
        transitionId: 'sub1',
      },
      items: { queue: [incoming('F1')] },
      display: { kind: null, payload: null, mode: 'normal' },
      action: {
        status: 'pending',
        commandId: 'c1',
        targetItemId: 'incoming:F1',
        errorCode: null,
      },
    };
    const store = storeFromState(forged);
    const types: string[] = [];
    const orig = store.dispatch.bind(store);
    store.dispatch = ((event: NotificationRuntimeEvent) => {
      types.push(event.type);
      return orig(event);
    }) as NotificationRuntimeStore['dispatch'];

    const outcomes: string[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(
        reconcileRuntimeQueuePresentation(
          store,
          EMPTY_RUNTIME_LEGACY_SINKS,
          'fail-mat',
        ),
      );
    }
    assert.equal(outcomes[0], 'normalized-idle');
    assert.ok(
      outcomes.includes('show-head') ||
        selectNotificationPresentationActive(store.getState()),
    );
    // After stabilization: only presentation-active / noop — no further settles.
    const tail = outcomes.slice(2);
    assert.ok(
      tail.every((o) => o === 'presentation-active' || o === 'noop'),
      `tail=${tail.join(',')}`,
    );
    const normalizeCount = types.filter((t) => t === 'RUNTIME_NORMALIZE_IDLE').length;
    const itemsCount = types.filter((t) => t === 'ITEMS_RECEIVED').length;
    assert.equal(normalizeCount, 1);
    assert.ok(itemsCount <= 2, `items=${itemsCount} types=${types.join(',')}`);
    assert.equal(selectNotificationPresentationActive(store.getState()), true);
  });

  check('5 bootstrap lifecycle → RUNTIME_NORMALIZE_IDLE cannot fire prematurely', () => {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { source: 'bootstrap' });
    assert.equal(store.getState().lifecycle.status, 'booting');
    const types: string[] = [];
    const orig = store.dispatch.bind(store);
    store.dispatch = ((event: NotificationRuntimeEvent) => {
      types.push(event.type);
      return orig(event);
    }) as NotificationRuntimeStore['dispatch'];
    assert.equal(
      reconcileRuntimeQueuePresentation(store, EMPTY_RUNTIME_LEGACY_SINKS),
      'wait-boot',
    );
    assert.equal(types.length, 0);
    assert.equal(store.getState().lifecycle.status, 'booting');
  });

  check('6 incomplete display → does not claim the screen', () => {
    const s = incompleteShowing([incoming('I1')]);
    assert.equal(selectNotificationPresentationActive(s), false);
    assert.equal(selectNotificationClaimsScreen(s), false);
    assert.equal(selectOverlayVisible(s), false);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
  });

  check('7 valid display → claims screen and paints card', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'show1',
      items: [incoming('V1')],
      replaceQueue: true,
      source: 'test',
    });
    const s = store.getState();
    assert.equal(s.display.kind, 'incoming');
    assert.ok(s.display.payload);
    assert.equal(selectNotificationPresentationActive(s), true);
    assert.equal(selectNotificationClaimsScreen(s), true);
    assert.equal(selectOverlayVisible(s), true);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), false);
  });

  check('8 queue pending without presentation → Lobby remains usable', () => {
    const s = orphanIdleQueue([incoming('P1'), incoming('P2'), incoming('P3')]);
    assert.equal(selectNotificationClaimsScreen(s), false);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
    // Lobby "may show" requires idle + no presentation — still true.
    assert.equal(selectLobbyMayShow(s), true);
  });

  await checkAsync('9 SUCCESS with next renderable item → next card appears', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'succ-next' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [
          { kind: 'incoming', ban: ban('S1') },
          { kind: 'incoming', ban: ban('S2') },
        ],
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(outcome, 'showing');
    assert.equal(selectNotificationPresentationActive(store.getState()), true);
    assert.equal(store.getState().display.kind, 'incoming');
    assert.ok(store.getState().display.payload);
  });

  await checkAsync('10 SUCCESS with no renderable item → full Lobby appears', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'succ-empty' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      { transitionId: req.transitionId, localItems: [] },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(outcome, 'idle');
    assert.equal(selectInteractiveLobbyChromeMayShow(store.getState()), true);
    assert.equal(selectNotificationClaimsScreen(store.getState()), false);
  });

  check('11 render-count / dispatch sequence stabilizes on startup', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    // Simulate Providers effect guard: skip while booting.
    assert.equal(
      reconcileRuntimeQueuePresentation(store, EMPTY_RUNTIME_LEGACY_SINKS),
      'wait-boot',
    );
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [],
        pendingItemIds: [],
        mode: 'normal',
        autoShow: false,
        source: 'bootstrap',
        sourceVersion: 'v-start',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    const outcomes: string[] = [];
    let dispatches = 0;
    const orig = store.dispatch.bind(store);
    store.dispatch = ((event: NotificationRuntimeEvent) => {
      dispatches += 1;
      return orig(event);
    }) as NotificationRuntimeStore['dispatch'];
    for (let i = 0; i < 20; i++) {
      outcomes.push(
        reconcileRuntimeQueuePresentation(store, EMPTY_RUNTIME_LEGACY_SINKS),
      );
    }
    assert.ok(outcomes.every((o) => o === 'noop'));
    assert.equal(dispatches, 0);
    assert.equal(selectInteractiveLobbyChromeMayShow(store.getState()), true);
  });

  check('Providers: reconcile after setNotificationChainTransitioning via useEffect', () => {
    const providers = readFileSync(
      join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
      'utf8',
    );
    const decl = providers.indexOf(
      'const setNotificationChainTransitioning = useCallback',
    );
    const reconcileCall = providers.indexOf(
      'reconcileRuntimeQueuePresentation(',
      decl,
    );
    assert.ok(decl > 0, 'setNotificationChainTransitioning declaration missing');
    assert.ok(
      reconcileCall > decl,
      'reconcile must sit after setNotificationChainTransitioning (TDZ fix)',
    );
    // Must not reintroduce the 37e4eb3 early useLayoutEffect reconcile.
    assert.doesNotMatch(
      providers,
      /useLayoutEffect\(\(\) => \{\s*\n\s*const outcome = reconcileRuntimeQueuePresentation/,
    );
    const effectSlice = providers.slice(decl, reconcileCall + 200);
    assert.match(effectSlice, /useEffect\(\(\) => \{/);
    assert.doesNotMatch(effectSlice, /useLayoutEffect\(\(\) => \{/);
  });

  check('booting chrome remains paintable (startup shell)', () => {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { source: 'bootstrap' });
    const s = store.getState();
    assert.equal(s.lifecycle.status, 'booting');
    assert.equal(selectNotificationClaimsScreen(s), false);
    assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
  });

  check('showing + valid payload claims; showing + kind only does not', () => {
    const good = createNotificationRuntimeStore();
    good.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'g',
      items: [{ kind: 'result', result: result('R') }],
      replaceQueue: true,
      source: 'test',
    });
    assert.equal(selectOverlayVisible(good.getState()), true);

    const bad = incompleteShowing([{ kind: 'result', result: result('R') }]);
    assert.equal(selectOverlayVisible(bad), false);
  });

  console.log(`\n${passed} startup regression checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
