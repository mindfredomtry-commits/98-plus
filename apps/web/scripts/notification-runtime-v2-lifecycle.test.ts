/**
 * Vertical 2 — overlay lifecycle + final queue completion tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v2-lifecycle.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/lib/notification-overlay-owner';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  dismissProductionHeadAtomic,
  ingestProductionQueue,
} from '../src/notification-runtime/notification-runtime.production-advance';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
} from '../src/notification-runtime/notification-runtime.store';
import { selectNotificationRuntimeUiSnapshot } from '../src/notification-runtime/notification-runtime.snapshot';
import {
  resolveOrdinaryLobbyMayOpen,
  resolveQueueShellHostMount,
  resolveQueueShellVisible,
} from '../src/notification-runtime/notification-runtime.shell-visibility';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationRuntimeReducer } from '../src/notification-runtime/notification-runtime.reducer';
import type { RuntimeEffect } from '../src/notification-runtime/notification-runtime.types';
import { computeOverlayVisualShieldDecision } from '../src/lib/overlay-visual-shield-trace-debug';
import { computeOverlayBackdropVisibilityDecision } from '../src/lib/overlay-backdrop-visibility-decision-debug';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): QueuedOverlay {
  return { kind: 'incoming', ban: ban(id) };
}
function check(id: string): QueuedOverlay {
  return { kind: 'check', ban: ban(id) };
}
function resultItem(id: string): QueuedOverlay {
  return { kind: 'result', result: result(id) };
}

function sinksFor(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  snapshots: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>>,
  effectsOut: RuntimeEffect[],
) {
  return {
    writeQueue: () => {
      snapshots.push(selectNotificationRuntimeUiSnapshot(store.getState()));
    },
    writeDisplay: (_patch: OwnerActiveDisplayPatch) => {
      snapshots.push(selectNotificationRuntimeUiSnapshot(store.getState()));
    },
    runEffects: (effects: RuntimeEffect[]) => {
      effectsOut.push(...effects);
    },
  };
}

// —— Final incoming ——
{
  const store = createNotificationRuntimeStore();
  const snapshots: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>> = [];
  const effects: RuntimeEffect[] = [];
  const sinks = sinksFor(store, snapshots, effects);
  ingestProductionQueue(store, [incoming('A')], 'test', sinks);
  assert.equal(selectOverlayVisible(store.getState()), true);
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    sinks,
  );
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(s.display.kind, null);
  assert.equal(s.display.payload, null);
  assert.equal(selectOverlayVisible(s), false);
  assert.equal(selectLobbyMayShow(s), true);
  for (const snap of snapshots) {
    const forbidden =
      snap.queueLength === 0 &&
      snap.display.incomingBan == null &&
      snap.display.checkBan == null &&
      snap.display.result == null &&
      snap.overlayVisible === true;
    assert.equal(forbidden, false);
  }
}

// —— Final result close_result ——
{
  const store = createNotificationRuntimeStore();
  const snapshots: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>> = [];
  const effects: RuntimeEffect[] = [];
  ingestProductionQueue(store, [resultItem('R')], 'test', sinksFor(store, snapshots, effects));
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'result:R',
      reason: 'result-dismiss',
      source: 'user',
    },
    sinksFor(store, snapshots, effects),
  );
  assert.equal(store.getState().lifecycle.status, 'idle');
  assert.equal(selectOverlayVisible(store.getState()), false);
}

// —— Final result go_to_bans ——
{
  const store = createNotificationRuntimeStore();
  const snaps: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>> = [];
  const effects: RuntimeEffect[] = [];
  ingestProductionQueue(store, [resultItem('G')], 'test', sinksFor(store, snaps, effects));
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'result:G',
      reason: 'result-cta-go-to-bans',
      source: 'user',
    },
    sinksFor(store, snaps, effects),
  );
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(selectLobbyMayShow(s), true);
  assert.equal(resolveOrdinaryLobbyMayOpen({ runtimeLobbyMayShow: true }), true);
}

// —— [A,B] dismiss A keeps shell ——
{
  const store = createNotificationRuntimeStore();
  const snaps: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>> = [];
  const effects: RuntimeEffect[] = [];
  const q = [incoming('A'), check('B')];
  ingestProductionQueue(store, q, 'test', sinksFor(store, snaps, effects));
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    sinksFor(store, snaps, effects),
  );
  const ui = selectNotificationRuntimeUiSnapshot(store.getState());
  assert.equal(ui.overlayVisible, true);
  assert.equal(ui.lobbyMayShow, false);
  assert.equal(ui.display.checkBan?.id, 'B');
  for (const snap of snaps) {
    const bad =
      snap.queueLength > 0 &&
      snap.overlayVisible === false &&
      snap.lobbyMayShow === true;
    assert.equal(bad, false);
  }
}

// —— Regression leftover shell ——
{
  const store = createNotificationRuntimeStore();
  const snaps: Array<ReturnType<typeof selectNotificationRuntimeUiSnapshot>> = [];
  const effects: RuntimeEffect[] = [];
  ingestProductionQueue(store, [resultItem('A')], 'test', sinksFor(store, snaps, effects));
  assert.equal(selectOverlayVisible(store.getState()), true);
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'result:A',
      reason: 'result-dismiss',
      source: 'user',
      transitionId: 'dismiss:leftover-1',
    },
    sinksFor(store, snaps, effects),
  );
  const ui = selectNotificationRuntimeUiSnapshot(store.getState());
  assert.deepEqual(
    {
      queue: ui.queueLength,
      display: ui.state.display.kind,
      lifecycle: ui.lifecycleStatus,
      overlayVisible: ui.overlayVisible,
      lobbyMayShow: ui.lobbyMayShow,
    },
    {
      queue: 0,
      display: null,
      lifecycle: 'idle',
      overlayVisible: false,
      lobbyMayShow: true,
    },
  );
  for (const snap of snaps) {
    assert.equal(
      snap.queueLength === 0 &&
        snap.state.display.kind == null &&
        snap.overlayVisible === true,
      false,
    );
  }
}

// —— Pins / dim / transitioning alone do not mount shell ——
{
  assert.equal(
    resolveQueueShellVisible({
      composeBlocksNotificationHost: false,
      sendSuccessCardActive: false,
      runtimeOverlayVisible: false,
    }),
    false,
  );
  assert.equal(
    resolveQueueShellHostMount({
      composeBlocksNotificationHost: false,
      sendSuccessCardActive: false,
      runtimeOverlayVisible: false,
    }),
    false,
  );
  const shield = computeOverlayVisualShieldDecision({
    visualQueueDimSessionLive: true,
    sendFlowOpening: false,
    replyParentTimerOwnsTopLayer: false,
    composeBlocksNotificationHost: false,
    showDirectOverboardLayer: false,
    shouldMountNotificationOverlayHostFromGuards: false,
    notificationOverlayVisible: false,
    ownerQueueLen: 0,
    ownerPendingLen: 0,
    queueHeadKind: null,
    shellDisplayKind: null,
  });
  assert.equal(shield.hostMounted, false);
  assert.equal(shield.cardContentMounted, false);

  const backdrop = computeOverlayBackdropVisibilityDecision({
    visualQueueDimSessionLive: true,
    notificationOverlayVisible: false,
    dimVisibleBefore: true,
    sendFlowOpening: false,
    replyParentTimerOwnsTopLayer: false,
    composeBlocksNotificationHost: false,
    showDirectOverboardLayer: false,
    ownerQueueLen: 0,
    queueHeadKind: null,
    notificationChainTransitioning: true,
    notificationSessionActive: true,
    chainAdvanceWaiting: true,
    cardContentMounted: false,
    visualQueueDimSessionLiveWithQueueHead: true,
    shieldBackdropVisible: true,
    shieldHostMounted: true,
    activeKind: null,
    shellKind: null,
  });
  assert.equal(backdrop.backdropMounted, false);
}

// —— Lobby request while showing no-op; after idle allowed ——
{
  assert.equal(
    resolveOrdinaryLobbyMayOpen({ runtimeLobbyMayShow: false }),
    false,
  );
  assert.equal(
    resolveOrdinaryLobbyMayOpen({ runtimeLobbyMayShow: true }),
    true,
  );
  const store = createNotificationRuntimeStore();
  ingestProductionQueue(
    store,
    [incoming('X')],
    'test',
    sinksFor(store, [], []),
  );
  assert.equal(selectLobbyMayShow(store.getState()), false);
}

// —— Duplicate final dismiss: no second effects ——
{
  const store = createNotificationRuntimeStore();
  const effects: RuntimeEffect[] = [];
  const tid = nextRuntimeTransitionId('final-dup');
  ingestProductionQueue(store, [incoming('D')], 'test', sinksFor(store, [], effects));
  const first = dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'incoming:D',
      reason: 'incoming-dismiss',
      source: 'user',
      transitionId: tid,
    },
    sinksFor(store, [], effects),
  );
  const firstEffectCount = first.effects.length;
  assert.ok(firstEffectCount >= 1);
  const second = dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'incoming:D',
      reason: 'incoming-dismiss',
      source: 'user',
      transitionId: tid,
    },
    sinksFor(store, [], effects),
  );
  assert.equal(second.effects.length, 0);
  assert.equal(selectOverlayVisible(store.getState()), false);
}

// —— REFRESH_PENDING failure must not reopen overlay ——
{
  const store = createNotificationRuntimeStore();
  ingestProductionQueue(store, [incoming('F')], 'test', sinksFor(store, [], []));
  let refreshFailed = false;
  dismissProductionHeadAtomic(
    store,
    {
      targetItemId: 'incoming:F',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    {
      writeQueue: () => {},
      writeDisplay: () => {},
      runEffects: (effects) => {
        for (const e of effects) {
          if (e.type === 'REFRESH_PENDING') {
            refreshFailed = true;
            // Simulate transport failure — must not remount.
          }
        }
      },
    },
  );
  assert.equal(refreshFailed, true);
  assert.equal(selectOverlayVisible(store.getState()), false);
  // Failed refresh does not re-show via LOBBY or ITEMS
  const afterFail = notificationRuntimeReducer(store.getState(), {
    type: 'LOBBY_REQUESTED',
    transitionId: 'lobby-after-fail',
    source: 'user',
  });
  assert.equal(selectOverlayVisible(afterFail.state), false);
}

// —— Source scans ——
{
  const webSrc = join(process.cwd(), 'apps/web/src');
  const providers = readFileSync(join(webSrc, 'components/Providers.tsx'), 'utf8');
  const instant = readFileSync(
    join(webSrc, 'components/instant-ban/InstantBanFlow.tsx'),
    'utf8',
  );

  assert.match(providers, /resolveQueueShellVisible/);
  assert.match(
    providers,
    /resolveQueueShellHostMount|notificationOverlayMayMount/,
  );
  assert.match(providers, /selectLobbyMayShow|runtimeLobbyMayShow/);
  assert.match(providers, /useSyncExternalStore/);
  assert.match(providers, /v2-atomic-advance/);
  assert.doesNotMatch(
    providers,
    /remaining\.length > 0 &&\r?\n\s*!isDeeplinkSingleCardModeActive/,
  );
  assert.doesNotMatch(
    providers,
    /FEATURE_FLAG.*notification.?runtime|USE_NEW_RUNTIME|notificationRuntimeEnabled/i,
  );
  assert.match(instant, /runtimeLobbyMayShow/);
  assert.match(instant, /decideLobbyClaimFromRuntime/);
  assert.match(instant, /lobbyClaimFromRuntime\.chromeMayShow/);
  assert.match(instant, /interactiveLobbyChromeMayShow/);
  // Strict openLobby authority remains selectLobbyMayShow (Providers / handoff).
  assert.match(
    readFileSync(
      join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
      'utf8',
    ),
    /selectLobbyMayShow/,
  );

  // Mega-OR early-true guards removed from Providers visibility
  assert.doesNotMatch(
    providers,
    /markVisibilityGuardReached\('owner-primary-stable-incoming-ban'\)/,
  );
  assert.doesNotMatch(
    providers,
    /markVisibilityGuardReached\('check-answer-waiting-result-hold'\)/,
  );

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(p, out);
      } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  const runtimeFiles = walk(join(webSrc, 'notification-runtime'));
  assert.ok(
    runtimeFiles.some((f) => f.endsWith('notification-runtime.shell-visibility.ts')),
  );
}

console.log('notification-runtime-v2-lifecycle.test.ts: ok');
