/**
 * Queue presentation: new-live materialize vs product surface paint guard.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-queue-presentation.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/lib/notification-overlay-owner';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  evaluateLiveOverlayDisplay,
  evaluateNewLiveQueuePresentation,
  productSurfaceBlocksNotificationPaint,
  resolveLiveOverlayScreen,
  type LiveOverlayScreenContext,
} from '../src/lib/live-overlay-screen';
import {
  isBansSectionDataRefreshSource,
  isPendingDataRefreshOnlySource,
} from '../src/lib/lobby-bans-indicator-debug';
import { planLobbyBansOpenNavigation } from '../src/lib/lobby-bans-open-navigation';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  ingestPendingSnapshot,
  markRuntimeItemConsumed,
} from '../src/notification-runtime/notification-runtime.pending';
import {
  notificationOverlayMayMount,
  resolveQueueShellHostMount,
} from '../src/notification-runtime/notification-runtime.shell-visibility';
import {
  selectIndicatorVisible,
  selectIsDirectEntry,
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createNotificationRuntimeStore,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import {
  dismissProductionHeadAtomic,
  ingestProductionQueue,
} from '../src/notification-runtime/notification-runtime.production-advance';
import { requestDirectEntry } from '../src/notification-runtime/notification-runtime.direct-entry';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import {
  applyPolledCheckResultToRuntime,
  executeSubmitCardActionEffect,
  requestCheckCardAction,
} from '../src/notification-runtime/notification-runtime.check-action';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incomingItem(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}
function incomingQueued(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}

function baseCtx(
  overrides: Partial<LiveOverlayScreenContext> = {},
): LiveOverlayScreenContext {
  return {
    lobbyOpen: true,
    sendComposePhase: 'idle',
    replyComposeActive: false,
    sendFlowOpen: false,
    notificationOverlayMounted: false,
    notificationChainTransitioning: false,
    notificationChainAwaitingUser: false,
    bansOverlayOpen: false,
    bansReturnToLobbyLatch: false,
    resultCtaBansOverlayOpen: false,
    bansCtaQueueSuppress: false,
    settingsOverlayOpen: false,
    profileOverlayOpen: false,
    successCardMounted: false,
    activeTimerOverlayMounted: false,
    ...overrides,
  };
}

function sinks() {
  return {
    writeQueue: (_q: QueuedOverlay[]) => {},
    writeDisplay: (_p: OwnerActiveDisplayPatch) => {},
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok — ${name}`);
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok — ${name}`);
}

async function main() {
  // Regression: cold boot / app shell must allow NEW live (not blocked-on-app)
  check('realtime + Lobby → new live queue may start', () => {
    const lobbyCtx = baseCtx();
    assert.equal(resolveLiveOverlayScreen(lobbyCtx), 'lobby');
    const decision = evaluateNewLiveQueuePresentation('real-time', lobbyCtx);
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'new-live-eligible');

    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    const autoShow = evaluateNewLiveQueuePresentation(
      'real-time',
      lobbyCtx,
    ).allowed;
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('L1')],
        pendingItemIds: ['incoming:L1'],
        mode: 'real-time',
        autoShow,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(store.getState().lifecycle.status, 'showing');
  });

  check('realtime + app shell (boot) → new live may start', () => {
    const appCtx = baseCtx({ lobbyOpen: false });
    assert.equal(resolveLiveOverlayScreen(appCtx), 'app');
    // Live WS enqueue still blocks `app` — new-live must NOT.
    assert.equal(
      evaluateLiveOverlayDisplay('real-time', appCtx, 'incoming', 'x').allowed,
      false,
    );
    const decision = evaluateNewLiveQueuePresentation('real-time', appCtx);
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'new-live-eligible');

    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('BOOT1')],
        pendingItemIds: ['incoming:BOOT1'],
        mode: 'real-time',
        autoShow: decision.allowed,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  check('bans section paints immediately', () => {
    const plan = planLobbyBansOpenNavigation({
      phaseIsIdle: true,
      banSentSuccess: false,
      runtimeDraining: false,
      alreadyOpen: false,
      openInFlight: false,
    });
    assert.equal(plan.openImmediately, true);
  });

  check('item over Profile → no overlay / pending survives', () => {
    const profileCtx = baseCtx({ settingsOverlayOpen: true });
    assert.equal(productSurfaceBlocksNotificationPaint(profileCtx), true);
    assert.equal(
      evaluateNewLiveQueuePresentation('real-time', profileCtx).allowed,
      false,
    );
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('P1')],
        pendingItemIds: ['incoming:P1'],
        mode: 'real-time',
        autoShow: false,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.equal(
      notificationOverlayMayMount({
        composeBlocksNotificationHost: false,
        sendSuccessCardActive: false,
        runtimeOverlayVisible: true,
        productSurfaceBlocksNotificationPaint: true,
      }),
      false,
    );
  });

  check('return Profile → Lobby resumes parked item exactly once', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('P2')],
        pendingItemIds: ['incoming:P2'],
        mode: 'real-time',
        autoShow: false,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), false);
    const lobbyCtx = baseCtx();
    assert.equal(
      evaluateNewLiveQueuePresentation('real-time', lobbyCtx).allowed,
      true,
    );
    syncRuntimeQueue(store, [incomingItem('P2')], 'bootstrap');
    assert.equal(selectOverlayVisible(store.getState()), true);
    const afterFirst = store.getState().lifecycle.transitionId;
    // Second flush while already showing must not clear / restart as idle
    syncRuntimeQueue(store, [incomingItem('P2')], 'bootstrap');
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(store.getState().lifecycle.status, 'showing');
    assert.ok(afterFirst != null);
  });

  check('item over Analytics → no overlay', () => {
    const analyticsCtx = baseCtx({ settingsOverlayOpen: true });
    assert.equal(
      evaluateNewLiveQueuePresentation('real-time', analyticsCtx).allowed,
      false,
    );
    assert.match(
      evaluateNewLiveQueuePresentation('real-time', analyticsCtx).reason,
      /blocked-on-settings/,
    );
  });

  check('return Analytics → Lobby resumes parked item', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('A1')],
        pendingItemIds: ['incoming:A1'],
        mode: 'real-time',
        autoShow: false,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    syncRuntimeQueue(store, [incomingItem('A1')], 'bootstrap');
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  check('normal mode + Lobby → indicator only', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    const lobbyCtx = baseCtx();
    assert.equal(
      evaluateNewLiveQueuePresentation('normal', lobbyCtx).allowed,
      false,
    );
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('N1')],
        pendingItemIds: ['incoming:N1'],
        mode: 'normal',
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectIndicatorVisible(store.getState()), true);
  });

  await checkAsync('SUCCESS continuation → next item', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'h-qp' });
    assert.equal(req.accepted, true);
    assert.equal(selectIsDraining(store.getState()), true);
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [incomingQueued('S1'), incomingQueued('S2')],
      },
      sinks(),
    );
    assert.equal(outcome, 'showing');
    assert.equal(selectOverlayVisible(store.getState()), true);
    const dismissed = dismissProductionHeadAtomic(
      store,
      {
        targetItemId: 'incoming:S1',
        reason: 'continue_chain',
        source: 'success',
      },
      sinks(),
    );
    assert.equal(dismissed.ok, true);
    assert.equal(dismissed.hasNext, true);
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  check('TIMER continuation → next item', () => {
    const store = createNotificationRuntimeStore();
    const queue = [incomingQueued('T1'), incomingQueued('T2')];
    ingestProductionQueue(store, queue, 'test', sinks());
    const dismissed = dismissProductionHeadAtomic(
      store,
      {
        targetItemId: 'incoming:T1',
        reason: 'continue_chain',
        source: 'timer',
      },
      sinks(),
    );
    assert.equal(dismissed.ok, true);
    assert.equal(dismissed.hasNext, true);
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  await checkAsync('CHECK continuation → result/next starts', async () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'ingest:check:C1',
      items: [{ kind: 'check', ban: ban('C1') }],
      replaceQueue: true,
      source: 'test',
    });
    assert.equal(store.getState().lifecycle.status, 'showing');
    const req = requestCheckCardAction(store, {
      banId: 'C1',
      completed: true,
      commandId: 'cmd-c1',
    });
    assert.equal(req.accepted, true);
    const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION');
    assert.ok(effect);
    await executeSubmitCardActionEffect(
      store,
      effect!,
      async () => ({ done: false, waiting: true }),
      'tok',
      sinks(),
    );
    const ok = applyPolledCheckResultToRuntime(
      store,
      'C1',
      { id: 'C1' } as never,
      sinks(),
    );
    assert.equal(ok, true);
    assert.equal(store.getState().display.kind, 'result');
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  check('DEEPLINK remains functional', () => {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(
      store,
      {
        targetId: 'D1',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incomingItem('D1'),
      },
      sinks(),
    );
    assert.equal(req.outcome, 'showing');
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  check('overlay never mounts over bans / Profile', () => {
    const bansCtx = baseCtx({ bansOverlayOpen: true });
    assert.equal(productSurfaceBlocksNotificationPaint(bansCtx), true);
    assert.equal(
      resolveQueueShellHostMount({
        composeBlocksNotificationHost: false,
        sendSuccessCardActive: false,
        runtimeOverlayVisible: true,
        productSurfaceBlocksNotificationPaint: true,
      }),
      false,
    );
    assert.equal(
      evaluateNewLiveQueuePresentation('real-time', bansCtx).allowed,
      false,
    );
  });

  check('pending not consumed while blocked', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('X1')],
        pendingItemIds: ['incoming:X1'],
        mode: 'real-time',
        autoShow: false,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.deepEqual(store.getState().consumed.itemIds, []);
    assert.equal(selectLobbyMayShow(store.getState()), true);
  });

  check('indicator flicker fix remains green', () => {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'bootstrap', 'v1');
    ingestPendingSnapshot(store, [], 'lobby-indicator-prime', 'v2-empty');
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectPendingCount(store.getState()), 1);
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    assert.equal(selectPendingCount(store.getState()), 0);
  });

  check('double click safe', () => {
    const second = planLobbyBansOpenNavigation({
      phaseIsIdle: true,
      banSentSuccess: false,
      runtimeDraining: false,
      alreadyOpen: false,
      openInFlight: true,
    });
    assert.equal(second.openImmediately, false);
  });

  check('Providers keeps park/flush + surface paint guard', () => {
    const providers = readFileSync(
      join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
      'utf8',
    );
    assert.match(providers, /notificationOverlayMayMount/);
    assert.match(providers, /evaluateNewLiveQueuePresentation/);
    assert.match(providers, /autoShow:\s*allowNewLiveAutoShow/);
    assert.match(providers, /tryFlushParkedNewLiveQueue/);
    assert.match(providers, /lobbyOpen-true/);
    assert.match(providers, /isPendingDataRefreshOnlySource/);
    assert.match(providers, /projectRuntimeQueueToLegacy/);
    assert.match(providers, /SUCCESS_CONTINUE_REQUESTED/);
  });

  check('bans prefetch source is DATA_REFRESH_ONLY', () => {
    assert.equal(
      isBansSectionDataRefreshSource('lobby-bans-cta-after-sync-open'),
      true,
    );
    assert.equal(
      isPendingDataRefreshOnlySource('lobby-bans-cta-after-sync-open'),
      true,
    );
    assert.equal(
      isPendingDataRefreshOnlySource('success-exit-v5-transport'),
      false,
    );
  });

  check('bans open blocks new-live; pending response must not showHead', () => {
    const bansCtx = baseCtx({ bansOverlayOpen: true });
    assert.equal(
      evaluateNewLiveQueuePresentation('real-time', bansCtx).allowed,
      false,
    );
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    // Slow pending resolve while bans active — autoShow must stay false
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('SLOW1')],
        pendingItemIds: ['incoming:SLOW1'],
        mode: 'real-time',
        autoShow: evaluateNewLiveQueuePresentation('real-time', bansCtx)
          .allowed,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.deepEqual(store.getState().consumed.itemIds, []);
  });

  check('InstantBanFlow sets arena bans guard synchronously', () => {
    const flow = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
      ),
      'utf8',
    );
    assert.match(
      flow,
      /setBansOverlayOpen\(true\);[\s\S]*setArenaOverlayGuardState\(\{\s*bansOverlayOpen:\s*true/,
    );
    assert.match(flow, /willCallStartLobbyBansNotificationDrain:\s*false/);
  });

  await checkAsync(
    'SUCCESS continuation uses runtime queue when legacy empty',
    async () => {
      const store = createNotificationRuntimeStore();
      // Seed runtime queue (Vertical 9 — legacy mirrors empty)
      ingestProductionQueue(
        store,
        [
          incomingQueued('S1'),
          incomingQueued('S2'),
          incomingQueued('S3'),
        ],
        'bootstrap',
        sinks(),
      );
      assert.equal(store.getState().items.queue.length, 3);

      const req = requestSuccessHandoff(store, { transitionId: 'h-cont' });
      assert.equal(req.accepted, true);
      // Empty localItems simulates empty overlayQueueRef + pendingStartup
      const outcome = await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: req.transitionId,
          localItems: [],
          fetchPendingItems: async () => [],
        },
        sinks(),
      );
      assert.equal(outcome, 'showing');
      assert.equal(selectOverlayVisible(store.getState()), true);
      assert.equal(store.getState().items.queue.length, 3);

      // Advance S1 → S2 → S3 via continue_chain
      let d = dismissProductionHeadAtomic(
        store,
        {
          targetItemId: 'incoming:S1',
          reason: 'continue_chain',
          source: 'success',
        },
        sinks(),
      );
      assert.equal(d.hasNext, true);
      d = dismissProductionHeadAtomic(
        store,
        {
          targetItemId: 'incoming:S2',
          reason: 'continue_chain',
          source: 'success',
        },
        sinks(),
      );
      assert.equal(d.hasNext, true);
      assert.equal(selectOverlayVisible(store.getState()), true);
    },
  );

  await checkAsync(
    'SUCCESS handoff accepted while runtime already showing',
    async () => {
      const store = createNotificationRuntimeStore();
      ingestProductionQueue(
        store,
        [incomingQueued('W1'), incomingQueued('W2')],
        'test',
        sinks(),
      );
      assert.equal(store.getState().lifecycle.status, 'showing');
      const req = requestSuccessHandoff(store, { transitionId: 'h-show' });
      assert.equal(req.accepted, true);
      assert.equal(selectIsDraining(store.getState()), true);
      const outcome = await executeSuccessHandoffMaterialize(
        store,
        {
          transitionId: req.transitionId,
          localItems: [],
          fetchPendingItems: async () => [],
        },
        sinks(),
      );
      assert.equal(outcome, 'showing');
      assert.equal(store.getState().items.queue.length, 2);
    },
  );

  check('new-live gate is not plain-lobby alias', () => {
    const src = readFileSync(
      join(process.cwd(), 'apps/web/src/lib/live-overlay-screen.ts'),
      'utf8',
    );
    assert.match(src, /new-live-eligible/);
    assert.doesNotMatch(
      src,
      /export function evaluateNewLiveQueuePresentation[\s\S]*return evaluateLiveOverlayDisplay/,
    );
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
