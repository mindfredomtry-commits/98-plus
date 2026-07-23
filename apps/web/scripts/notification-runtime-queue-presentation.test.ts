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
  evaluateNewLiveQueuePresentation,
  productSurfaceBlocksNotificationPaint,
  resolveLiveOverlayScreen,
  type LiveOverlayScreenContext,
} from '../src/lib/live-overlay-screen';
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
  // 1. bans section paints immediately (plan)
  check('bans section paints immediately', () => {
    const plan = planLobbyBansOpenNavigation({
      phaseIsIdle: true,
      banSentSuccess: false,
      runtimeDraining: false,
      alreadyOpen: false,
      openInFlight: false,
    });
    assert.equal(plan.openImmediately, true);
    assert.equal(plan.runBackgroundPrefetch, true);
  });

  // 2–3. prefetch/bootstrap resolve over Profile / Analytics → no mount
  check('prefetch resolve over Profile does not mount overlay', () => {
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
        sourceVersion: 'v1',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectPendingCount(store.getState()), 1);
    const profileCtx = baseCtx({ settingsOverlayOpen: true });
    assert.equal(resolveLiveOverlayScreen(profileCtx), 'settings');
    assert.equal(productSurfaceBlocksNotificationPaint(profileCtx), true);
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

  check('prefetch resolve over Analytics does not mount overlay', () => {
    const analyticsCtx = baseCtx({ settingsOverlayOpen: true });
    assert.equal(productSurfaceBlocksNotificationPaint(analyticsCtx), true);
    const decision = evaluateNewLiveQueuePresentation(
      'real-time',
      analyticsCtx,
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /blocked-on-settings/);
  });

  // 4. pending item survives blocked presentation
  check('pending item survives blocked presentation', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('S1')],
        pendingItemIds: ['incoming:S1'],
        mode: 'real-time',
        autoShow: false,
        source: 'bootstrap',
      },
      EMPTY_RUNTIME_LEGACY_SINKS,
    );
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectIndicatorVisible(store.getState()), true);
  });

  // 5. normal mode non-Lobby → indicator only
  check('normal mode non-Lobby indicator only', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
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
    const decision = evaluateNewLiveQueuePresentation(
      'normal',
      baseCtx({ settingsOverlayOpen: true }),
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'normal-mode');
  });

  // 6. realtime non-Lobby → no overlay materialize
  check('realtime non-Lobby no overlay materialize', () => {
    const bansCtx = baseCtx({ bansOverlayOpen: true });
    const decision = evaluateNewLiveQueuePresentation('real-time', bansCtx);
    assert.equal(decision.allowed, false);
    assert.equal(resolveLiveOverlayScreen(bansCtx), 'bans');
    assert.equal(
      resolveQueueShellHostMount({
        composeBlocksNotificationHost: false,
        sendSuccessCardActive: false,
        runtimeOverlayVisible: true,
        productSurfaceBlocksNotificationPaint:
          productSurfaceBlocksNotificationPaint(bansCtx),
      }),
      false,
    );
  });

  // 7. realtime return to Lobby → queue may materialize
  check('realtime return to Lobby queue materializes', () => {
    const store = createNotificationRuntimeStore();
    const boot = requestBootstrap(store, { source: 'bootstrap' });
    completeBootstrap(
      store,
      {
        transitionId: boot.transitionId!,
        items: [incomingItem('R1')],
        pendingItemIds: ['incoming:R1'],
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
    syncRuntimeQueue(store, [incomingItem('R1')], 'bootstrap');
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  // 8–9. overlay never mounts over bans / Profile
  check('overlay never mounts over bans', () => {
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

  check('overlay never mounts over Profile', () => {
    const profileCtx = baseCtx({ settingsOverlayOpen: true });
    assert.equal(productSurfaceBlocksNotificationPaint(profileCtx), true);
  });

  // 10. SUCCESS flow unchanged
  await checkAsync('SUCCESS flow unchanged', async () => {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { transitionId: 'h-qp' });
    assert.equal(req.accepted, true);
    assert.equal(selectIsDraining(store.getState()), true);
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [incomingQueued('A')],
      },
      sinks(),
    );
    assert.equal(outcome, 'showing');
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
  });

  // 11. TIMER/chain continuation unchanged (dismiss → next)
  check('TIMER flow unchanged', () => {
    const store = createNotificationRuntimeStore();
    const queue = [incomingQueued('T1'), incomingQueued('T2')];
    ingestProductionQueue(store, queue, 'test', sinks());
    assert.equal(store.getState().lifecycle.status, 'showing');
    const dismissed = dismissProductionHeadAtomic(
      store,
      {
        queueBefore: queue,
        targetItemId: 'incoming:T1',
        reason: 'continue_chain',
        source: 'test',
      },
      sinks(),
    );
    assert.equal(dismissed.ok, true);
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(dismissed.hasNext, true);
  });

  // 12. DEEPLINK flow unchanged
  check('DEEPLINK flow unchanged', () => {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(
      store,
      {
        targetId: 'A',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incomingItem('A'),
      },
      sinks(),
    );
    assert.equal(req.outcome, 'showing');
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), true);
  });

  // 13. indicator stable — empty indicator-prime does not wipe
  check('indicator stable against empty indicator-prime race', () => {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'bootstrap', 'v1');
    assert.equal(selectIndicatorVisible(store.getState()), true);
    ingestPendingSnapshot(store, [], 'lobby-indicator-prime', 'v2-empty');
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectPendingCount(store.getState()), 1);
    ingestPendingSnapshot(
      store,
      ['incoming:A', 'incoming:B'],
      'lobby-indicator-prime',
      'v3',
    );
    assert.equal(selectPendingCount(store.getState()), 2);
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    assert.equal(selectPendingCount(store.getState()), 1);
  });

  // 14. double click safe
  check('double click safe', () => {
    const first = planLobbyBansOpenNavigation({
      phaseIsIdle: true,
      banSentSuccess: false,
      runtimeDraining: false,
      alreadyOpen: false,
      openInFlight: false,
    });
    const second = planLobbyBansOpenNavigation({
      phaseIsIdle: true,
      banSentSuccess: false,
      runtimeDraining: false,
      alreadyOpen: false,
      openInFlight: true,
    });
    assert.equal(first.openImmediately, true);
    assert.equal(second.openImmediately, false);
  });

  // Wiring
  check('Providers wires surface presentation guard', () => {
    const root = join(process.cwd(), 'apps/web/src/components/Providers.tsx');
    const providers = readFileSync(root, 'utf8');
    assert.match(providers, /notificationOverlayMayMount/);
    assert.match(providers, /productSurfaceBlocksNotificationPaint/);
    assert.match(providers, /evaluateNewLiveQueuePresentation/);
    assert.match(providers, /autoShow:\s*allowNewLiveAutoShow/);
    assert.match(providers, /parkedNewLiveBootstrapItemsRef/);
    assert.match(providers, /QUEUE_MATERIALIZE_BLOCKED/);
  });

  check('pending skips empty indicator-prime wipe', () => {
    const pendingPath = join(
      process.cwd(),
      'apps/web/src/notification-runtime/notification-runtime.pending.ts',
    );
    const pending = readFileSync(pendingPath, 'utf8');
    assert.match(pending, /isPassiveIndicatorPrimeSource/);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
