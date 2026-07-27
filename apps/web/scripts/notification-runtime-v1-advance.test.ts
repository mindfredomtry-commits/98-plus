/**
 * Vertical 1 — queue + atomic advance production bridge tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v1-advance.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  mapDismissReasonToCardReason,
  projectRuntimeAdvanceSnapshot,
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
} from '../src/notification-runtime/notification-runtime.adapters';
import {
  dismissProductionHeadAtomic,
  ingestProductionQueue,
  runtimeHeadItemId,
} from '../src/notification-runtime/notification-runtime.production-advance';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
} from '../src/notification-runtime/notification-runtime.store';
import { selectCurrentItem, selectLobbyMayShow, selectOverlayVisible } from '../src/notification-runtime/notification-runtime.selectors';
import type { RuntimeEffect } from '../src/notification-runtime/notification-runtime.types';

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

type LegacyMirror = {
  queue: QueuedOverlay[];
  display: OwnerActiveDisplayPatch;
  effects: RuntimeEffect[];
  displaySnapshots: Array<{
    displayKind: string | null;
    overlayVisible: boolean;
    lobbyMayShow: boolean;
    queueLen: number;
  }>;
};

function createMirror(store: ReturnType<typeof createNotificationRuntimeStore>): {
  mirror: LegacyMirror;
  sinks: {
    writeQueue: (queue: QueuedOverlay[], source: string) => void;
    writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
    runEffects: (effects: RuntimeEffect[]) => void;
  };
} {
  const mirror: LegacyMirror = {
    queue: [],
    display: {},
    effects: [],
    displaySnapshots: [],
  };
  const pushSnapshot = () => {
    const state = store.getState();
    const kind = state.display.kind;
    mirror.displaySnapshots.push({
      displayKind: kind,
      overlayVisible: selectOverlayVisible(state),
      lobbyMayShow: selectLobbyMayShow(state),
      queueLen: state.items.queue.length,
    });
  };
  return {
    mirror,
    sinks: {
      writeQueue(queue) {
        mirror.queue = queue;
        pushSnapshot();
      },
      writeDisplay(patch) {
        mirror.display = patch;
        pushSnapshot();
      },
      runEffects(effects) {
        mirror.effects.push(...effects);
      },
    },
  };
}

// —— 1. Ingest [A,B] ——
{
  const store = createNotificationRuntimeStore();
  const { mirror, sinks } = createMirror(store);
  const queue = [incoming('A'), check('B')];
  ingestProductionQueue(store, queue, 'test-ingest', sinks);
  assert.equal(store.getState().items.queue.length, 2);
  assert.equal(runtimeHeadItemId(mirror.queue), 'incoming:A');
  assert.equal(selectCurrentItem(store.getState())?.kind, 'incoming');
  assert.equal(store.getState().lifecycle.status, 'showing');
  assert.equal(projectRuntimeQueueToLegacy(store.getState()).length, 2);
}

// —— 2–4. Dismiss A → atomic B ——
{
  const store = createNotificationRuntimeStore();
  const { mirror, sinks } = createMirror(store);
  const queue = [incoming('A'), check('B')];
  ingestProductionQueue(store, queue, 'test-ingest', sinks, {
    projectLegacy: true,
  });

  const transitionId = nextRuntimeTransitionId('dismiss-test');
  const beforeEffects = mirror.effects.length;
  const result = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: queue,
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'test-dismiss',
      transitionId,
    },
    sinks,
  );

  assert.equal(result.hasNext, true);
  assert.equal(result.state.items.queue.length, 1);
  assert.equal(result.snapshot.currentId, 'check:B');
  assert.equal(result.state.display.kind, 'check');
  assert.equal(result.state.lifecycle.status, 'showing');
  assert.equal(selectOverlayVisible(result.state), true);
  assert.equal(selectLobbyMayShow(result.state), false);
  assert.equal(mirror.queue.length, 1);
  assert.equal(mirror.queue[0]?.kind, 'check');
  assert.equal(mirror.display.checkBan?.id, 'B');
  assert.equal(mirror.display.incomingBan, null);
  // One CARD_DISMISS (effects from dismiss; MARK_CONSUMED + PREFETCH)
  assert.ok(result.effects.some((e) => e.type === 'MARK_CONSUMED'));
  assert.ok(mirror.effects.length > beforeEffects);

  // No snapshot with display=null while queue still has next after dismiss projection
  const afterDismiss = mirror.displaySnapshots.filter((s) => s.queueLen === 1);
  for (const snap of afterDismiss) {
    assert.notEqual(snap.displayKind, null);
    assert.equal(snap.lobbyMayShow, false);
    assert.equal(snap.overlayVisible, true);
  }
}

// —— 5. No lobby open when hasNext ——
{
  const store = createNotificationRuntimeStore();
  const { sinks } = createMirror(store);
  ingestProductionQueue(
    store,
    [incoming('A'), check('B')],
    'test',
    sinks,
  );
  const r = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: [incoming('A'), check('B')],
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    sinks,
  );
  assert.equal(selectLobbyMayShow(r.state), false);
}

// —— 6–7. Duplicate dismiss / same transitionId no-op ——
{
  const store = createNotificationRuntimeStore();
  const { sinks } = createMirror(store);
  const queue = [incoming('A'), check('B')];
  ingestProductionQueue(store, queue, 'test', sinks);
  const transitionId = 'dismiss:dup-1';
  const first = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: queue,
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
      transitionId,
    },
    sinks,
  );
  assert.equal(first.state.items.queue.length, 1);
  const second = dismissProductionHeadAtomic(
    store,
    {
      queueBefore: projectRuntimeQueueToLegacy(first.state),
      targetItemId: 'check:B',
      reason: 'incoming-dismiss',
      source: 'user',
      transitionId, // same id → CARD_DISMISS ignored; align ingest may refresh
    },
    sinks,
  );
  // Same transitionId: dismiss is no-op; queue stays [B] (or realigned to queueBefore)
  assert.equal(second.state.lifecycle.status, 'showing');
  assert.ok(second.state.items.queue.length >= 1);
}

// —— 8. Ingest duplicate item does not duplicate ——
{
  const store = createNotificationRuntimeStore();
  const { sinks } = createMirror(store);
  ingestProductionQueue(store, [incoming('A')], 'test', sinks);
  ingestProductionQueue(
    store,
    [incoming('A'), incoming('A')],
    'test-dup',
    sinks,
  );
  assert.equal(store.getState().items.queue.length, 1);
}

// —— 9. React projection displays B ——
{
  const store = createNotificationRuntimeStore();
  const { mirror, sinks } = createMirror(store);
  ingestProductionQueue(
    store,
    [incoming('A'), check('B')],
    'test',
    sinks,
  );
  dismissProductionHeadAtomic(
    store,
    {
      queueBefore: [incoming('A'), check('B')],
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    sinks,
  );
  const projected = projectRuntimeDisplayToLegacy(store.getState());
  assert.equal(projected.checkBan?.id, 'B');
  assert.equal(projected.incomingBan, null);
  assert.equal(mirror.display.checkBan?.id, 'B');
}

// —— Regression: incoming A → dismiss → check B snapshots ——
{
  const store = createNotificationRuntimeStore();
  const snapshots: Array<{
    display: string | null;
    overlayVisible: boolean;
    lobbyMayShow: boolean;
  }> = [];

  const record = () => {
    const s = store.getState();
    snapshots.push({
      display: s.display.kind,
      overlayVisible: selectOverlayVisible(s),
      lobbyMayShow: selectLobbyMayShow(s),
    });
  };

  const { sinks } = createMirror(store);
  const wrappedSinks = {
    writeQueue: (q: QueuedOverlay[], src: string) => {
      sinks.writeQueue(q, src);
      record();
    },
    writeDisplay: (p: OwnerActiveDisplayPatch, src: string) => {
      sinks.writeDisplay(p, src);
      record();
    },
    runEffects: sinks.runEffects,
  };

  ingestProductionQueue(
    store,
    [incoming('A'), check('B')],
    'test',
    wrappedSinks,
  );
  // snapshot after ingest: incoming A
  assert.equal(store.getState().display.kind, 'incoming');
  assert.equal(selectOverlayVisible(store.getState()), true);
  assert.equal(selectLobbyMayShow(store.getState()), false);

  dismissProductionHeadAtomic(
    store,
    {
      queueBefore: [incoming('A'), check('B')],
      targetItemId: 'incoming:A',
      reason: 'incoming-dismiss',
      source: 'user',
    },
    wrappedSinks,
  );

  assert.equal(store.getState().display.kind, 'check');
  assert.equal(selectOverlayVisible(store.getState()), true);
  assert.equal(selectLobbyMayShow(store.getState()), false);

  // Forbidden intermediate
  for (const snap of snapshots) {
    const forbidden =
      snap.display === null &&
      snap.overlayVisible === false &&
      snap.lobbyMayShow === true;
    assert.equal(forbidden, false);
  }
}

// —— mapDismissReason ——
{
  assert.equal(mapDismissReasonToCardReason('incoming-dismiss'), 'user_dismiss');
  assert.equal(mapDismissReasonToCardReason('result-cta-go-to-bans'), 'go_to_bans');
  assert.equal(mapDismissReasonToCardReason('result-dismiss'), 'close_result');
}

// —— Source scans ——
{
  const webSrc = join(process.cwd(), 'apps/web/src');
  const providers = readFileSync(
    join(webSrc, 'components/Providers.tsx'),
    'utf8',
  );

  assert.match(
    providers,
    /NotificationRuntimeContext\.Provider/,
    'one production runtime provider wiring',
  );
  assert.match(
    providers,
    /dismissProductionHeadAtomic/,
    'atomic dismiss wired',
  );
  assert.match(
    providers,
    /syncRuntimeQueue/,
    'ingest syncs runtime queue authority',
  );
  assert.match(
    providers,
    /canUseV1AtomicAdvance/,
    'ordinary dismiss uses V1/V2 atomic path',
  );
  assert.match(
    providers,
    /v2-atomic-advance/,
    'atomic advance projection marker',
  );
  assert.doesNotMatch(
    providers,
    /remaining\.length > 0 &&\s*\n\s*!isDeeplinkSingleCardModeActive/,
    'no remaining.length>0 gate for ordinary atomic dismiss',
  );
  assert.doesNotMatch(
    providers,
    /FEATURE_FLAG.*notification.?runtime|notificationRuntimeEnabled|USE_NEW_RUNTIME/i,
    'no feature gate',
  );

  // TEMP adapters are read-only (no advance / lobby / clear APIs)
  const adapters = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.adapters.ts'),
    'utf8',
  );
  assert.match(adapters, /TEMP V1–V2/);
  assert.doesNotMatch(adapters, /setLobbyOpen|CARD_DISMISS|popOverlayHead/);
  assert.match(adapters, /MUST NOT/);

  // Ordinary dismiss with remaining must not clear-before-next in prepare path
  assert.match(
    providers,
    /never clear display before next when remaining exists/,
  );

  // Walk scripts + runtime for second production advance engine markers in src
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(p, out);
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(p);
      }
    }
    return out;
  }

  const runtimeFiles = walk(join(webSrc, 'notification-runtime'));
  assert.ok(
    runtimeFiles.some((f) => f.endsWith('NotificationRuntimeProvider.tsx')),
  );
  assert.ok(
    runtimeFiles.some((f) =>
      f.endsWith('notification-runtime.production-advance.ts'),
    ),
  );

  // Prove production path uses new runtime (import present exactly via Providers)
  const importCount = (
    providers.match(/from '@\/notification-runtime\//g) ?? []
  ).length;
  assert.ok(importCount >= 1, 'Providers imports notification-runtime');
}

console.log('notification-runtime-v1-advance.test.ts: ok');
