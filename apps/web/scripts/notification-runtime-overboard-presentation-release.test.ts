/**
 * Vertical V4 — Lobby CTA restore on post-notification presentation fully released.
 *
 * Runtime-idle alone must NOT restore CTA while a host result/dim/mount layer
 * is still painted. Restore only on the false→true fully-released edge via
 * allowSuccessExitLobbyOpen → openLobby → beginCtaSpringIn.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-overboard-presentation-release.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  executeSubmitIncomingOverboardEffect,
  requestIncomingOverboardAction,
} from '../src/notification-runtime/notification-runtime.overboard-action';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  buildPostNotificationPresentationSnapshot,
  detectPostNotificationPresentationReleaseEdge,
  explainPostNotificationPresentationRelease,
  isPostNotificationPresentationFullyReleased,
  type PostNotificationPresentationSnapshot,
} from '../src/lib/post-notification-presentation-release';
import {
  noteRuntimeOverboardHeadConsumed,
  resetRuntimeOverboardHeadConsumedForTest,
  wasRuntimeOverboardHeadConsumed,
} from '../src/lib/runtime-overboard-head-consumed';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: message });
    console.error(`FAIL — ${name}`);
    console.error(message);
  }
}

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

type Store = ReturnType<typeof createNotificationRuntimeStore>;

function ingest(store: Store, items: NotificationItem[]) {
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: `ingest:${items.map(notificationItemId).join(',')}`,
    items,
    replaceQueue: true,
    source: 'test',
  });
}

async function overboard(store: Store, banId: string, transportOk = true) {
  const requested = requestIncomingOverboardAction(store, {
    banId,
    commandId: `cmd-${banId}`,
  });
  assert.equal(requested.accepted, true, `request ${banId}`);
  const effect = requested.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION');
  assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');
  return executeSubmitIncomingOverboardEffect(
    store,
    effect,
    async () =>
      transportOk
        ? // Production overboard HTTP answers `{ ok, ban }` with no result —
          // that is the consume-and-advance path these presentation specs cover.
          // Matching-result materialization is covered by the Fix B suite.
          { ok: true, result: null }
        : { ok: false, error: 'API_FAIL' },
    'tok',
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
}

function hostCleared(
  overrides: Partial<{
    notificationOverlayMounted: boolean;
    hostResultActive: boolean;
    directOverboardActive: boolean;
    notificationChainTransitioning: boolean;
    visualQueueDimSession: boolean;
    orbOverlayDim: boolean;
    postSuccessHandoffBlocking: boolean;
    successExitDraining: boolean;
  }> = {},
) {
  return {
    notificationOverlayMounted: false,
    notificationQueueUiLock: false,
    hostResultActive: false,
    directOverboardActive: false,
    notificationChainTransitioning: false,
    visualQueueDimSession: false,
    orbOverlayDim: false,
    postSuccessHandoffBlocking: false,
    successExitDraining: false,
    ...overrides,
    notificationQueueUiLock:
      overrides.notificationOverlayMounted ??
      overrides.notificationQueueUiLock ??
      false,
  };
}

function snapFrom(
  runtime: NotificationRuntimeState,
  host = hostCleared(),
): PostNotificationPresentationSnapshot {
  return buildPostNotificationPresentationSnapshot(runtime, {
    ...host,
    notificationQueueUiLock:
      host.notificationQueueUiLock ?? host.notificationOverlayMounted,
  });
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

async function main() {
  console.log('\n=== V4 POST-NOTIFICATION PRESENTATION RELEASE ===\n');

  await spec(
    'FINAL RELEASE BOOLEAN: all conditions required; host result alone blocks',
    () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('X')]);
      // Showing card — not released
      assert.equal(
        isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), hostCleared()),
        ),
        false,
      );
      const reasonShowing = explainPostNotificationPresentationRelease(
        snapFrom(store.getState(), hostCleared()),
      ).reason;
      assert.ok(reasonShowing);

      // Force idle empty runtime via consume path simulation: clear by dispatching
      // a dismiss after ingesting empty is awkward — use overboard below in A.
      const idleEmpty = {
        ...store.getState(),
        lifecycle: { status: 'idle' as const, source: 'test' as const, transitionId: null },
        display: { kind: null, payload: null, mode: 'normal' as const },
        items: { queue: [] as NotificationItem[] },
        action: {
          status: 'idle' as const,
          commandId: null,
          targetItemId: null,
          errorCode: null,
        },
      };
      assert.equal(
        isPostNotificationPresentationFullyReleased(
          snapFrom(idleEmpty, hostCleared({ hostResultActive: true })),
        ),
        false,
        'host result blocks',
      );
      assert.equal(
        explainPostNotificationPresentationRelease(
          snapFrom(idleEmpty, hostCleared({ hostResultActive: true })),
        ).reason,
        'noHostResult',
      );
      assert.equal(
        isPostNotificationPresentationFullyReleased(
          snapFrom(idleEmpty, hostCleared()),
        ),
        true,
      );
    },
  );

  await spec(
    'A: runtime idle first + host result mounted → CTA remains blocked; unmount → edge',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      const res = await overboard(store, 'A');
      assert.equal(res.ok, true);
      const runtime = store.getState();
      assert.equal(runtime.lifecycle.status, 'idle');
      assert.equal(runtime.items.queue.length, 0);

      let prev: boolean | null = false; // was presenting
      const withResult = snapFrom(
        runtime,
        hostCleared({ hostResultActive: true, orbOverlayDim: true }),
      );
      assert.equal(isPostNotificationPresentationFullyReleased(withResult), false);
      let det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(withResult),
      );
      assert.equal(det.edge, false, 'no edge while host result mounted');
      prev = det.nextPrevious;

      const released = snapFrom(runtime, hostCleared());
      assert.equal(isPostNotificationPresentationFullyReleased(released), true);
      det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(released),
      );
      assert.equal(det.edge, true, 'edge after host result/dim unmount');
    },
  );

  await spec(
    'B: no result path — runtime idle + host pins already false → one edge',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('B')]);
      let prev: boolean | null = null;
      // Seed while showing
      let det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), hostCleared({ notificationOverlayMounted: true })),
        ),
      );
      prev = det.nextPrevious;
      assert.equal(det.edge, false);

      await overboard(store, 'B');
      det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), hostCleared()),
        ),
      );
      assert.equal(det.edge, true);
      prev = det.nextPrevious;

      // Repeat observation — no second edge
      det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), hostCleared()),
        ),
      );
      assert.equal(det.edge, false);
    },
  );

  await spec(
    'C: three-card chain — no edge between cards; one edge after final release',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('C1'), incoming('C2'), incoming('C3')]);
      let prev: boolean | null = false;
      let edges = 0;

      const observe = (host = hostCleared({ notificationOverlayMounted: true })) => {
        const released = isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), host),
        );
        const det = detectPostNotificationPresentationReleaseEdge(prev, released);
        prev = det.nextPrevious;
        if (det.edge) edges += 1;
      };

      observe();
      await overboard(store, 'C1');
      observe(); // still showing C2
      assert.equal(store.getState().items.queue.length, 2);
      assert.equal(edges, 0);

      await overboard(store, 'C2');
      observe(); // still showing C3
      assert.equal(edges, 0);

      await overboard(store, 'C3');
      observe(hostCleared()); // fully released
      assert.equal(store.getState().items.queue.length, 0);
      assert.equal(edges, 1);
    },
  );

  await spec(
    'D: API failure — no fully-released edge; current card remains',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('D')]);
      let prev: boolean | null = false;
      const res = await overboard(store, 'D', false);
      assert.equal(res.ok, false);
      assert.equal(store.getState().lifecycle.status, 'showing');
      assert.equal(store.getState().items.queue.length, 1);
      const det = detectPostNotificationPresentationReleaseEdge(
        prev,
        isPostNotificationPresentationFullyReleased(
          snapFrom(store.getState(), hostCleared({ notificationOverlayMounted: true })),
        ),
      );
      assert.equal(det.edge, false);
    },
  );

  await spec(
    'E: stale overlayQueueRef is not part of the release boolean',
    () => {
      const src = readSource(
        'apps/web/src/lib/post-notification-presentation-release.ts',
      );
      assert.equal(src.includes('overlayQueueRef'), false);
      assert.equal(src.includes('overlayQueueLength'), false);
      // Boolean uses rendered presentation signals only
      assert.match(src, /notificationOverlayMounted/);
      assert.match(src, /hostResultActive/);
      assert.match(src, /visualQueueDimSession/);
    },
  );

  await spec(
    'F: host result still visible must block CTA restore (fully-released false)',
    () => {
      const idleEmpty = {
        lifecycle: { status: 'idle' as const, source: 'test' as const, transitionId: null },
        display: { kind: null, payload: null, mode: 'normal' as const },
        items: { queue: [] as NotificationItem[] },
        action: {
          status: 'idle' as const,
          commandId: null,
          targetItemId: null,
          errorCode: null,
        },
        pending: { itemIds: [], sourceVersion: 0, generation: 0 },
        consumed: { itemIds: [] },
        recovery: { status: 'idle' as const },
        directEntry: {
          active: false,
          returnPolicy: 'lobby_after_card' as const,
          deferred: null,
        },
      } as NotificationRuntimeState;
      assert.equal(
        isPostNotificationPresentationFullyReleased(
          snapFrom(idleEmpty, hostCleared({ hostResultActive: true })),
        ),
        false,
      );
      assert.equal(
        isPostNotificationPresentationFullyReleased(
          snapFrom(idleEmpty, hostCleared({ directOverboardActive: true })),
        ),
        false,
      );
    },
  );

  await spec(
    'G: repeated renders do not retrigger edge / CTA animation',
    () => {
      let prev: boolean | null = false;
      const released = true;
      let edges = 0;
      for (let i = 0; i < 5; i++) {
        const det = detectPostNotificationPresentationReleaseEdge(prev, released);
        prev = det.nextPrevious;
        if (det.edge) edges += 1;
      }
      assert.equal(edges, 1, 'exactly one edge across repeated true observations');
    },
  );

  await spec(
    'H: InstantBanFlow still uses existing restore paths; V4 does not call setCtaState directly',
    () => {
      const flow = readSource(
        'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
      );
      assert.match(flow, /post-notification-presentation-released/);
      assert.match(flow, /allowSuccessExitLobbyOpen\(\)/);
      assert.match(flow, /beginCtaSpringIn\(\)/);
      assert.match(flow, /openLobby\('post-notification-presentation-released'\)/);
      // V3 CTA restore from runtime completion edge is bypassed
      assert.equal(
        flow.includes("openLobby('overboard-runtime-complete')"),
        false,
      );
      // Existing restore paths remain
      assert.match(flow, /restoreLobbyCtaAfterBansSectionClose/);
      assert.match(flow, /success-exit-empty-queue/);
      // V4 effect must not setCtaState directly in the release edge path —
      // setCtaState still exists for normal UI; assert edge uses beginCtaSpringIn.
      const edgeIdx = flow.indexOf('post-notification-presentation-released');
      assert.ok(edgeIdx > 0);
      const window = flow.slice(Math.max(0, edgeIdx - 400), edgeIdx + 200);
      assert.equal(window.includes("setCtaState('"), false);
      assert.match(window, /beginCtaSpringIn\(\)/);
    },
  );

  await spec(
    'HOST RESULT POLICY: runtime-consumed overboard blocks host result reopen',
    () => {
      resetRuntimeOverboardHeadConsumedForTest();
      assert.equal(wasRuntimeOverboardHeadConsumed('Z'), false);
      noteRuntimeOverboardHeadConsumed('Z');
      assert.equal(wasRuntimeOverboardHeadConsumed('Z'), true);
      const providers = readSource('apps/web/src/components/Providers.tsx');
      assert.match(providers, /noteRuntimeOverboardHeadConsumed/);
      assert.match(providers, /wasRuntimeOverboardHeadConsumed/);
      assert.match(providers, /runtime-overboard-head-consumed/);
    },
  );

  await spec(
    'SOURCE: V4 boolean lives in dedicated module; InstantBanFlow wires edge',
    () => {
      const mod = readSource(
        'apps/web/src/lib/post-notification-presentation-release.ts',
      );
      assert.match(mod, /isPostNotificationPresentationFullyReleased/);
      assert.match(mod, /detectPostNotificationPresentationReleaseEdge/);
      const flow = readSource(
        'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
      );
      assert.match(flow, /isPostNotificationPresentationFullyReleased/);
      assert.match(flow, /detectPostNotificationPresentationReleaseEdge/);
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — ${failed.length} failed` : ''),
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
