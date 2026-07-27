/**
 * Vertical 5 — SUCCESS handoff / drain materialize (runtime sole owner).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v5-success-handoff.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
  sortQueuedForSuccessDrain,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import { ingestPendingSnapshot } from '../src/notification-runtime/notification-runtime.pending';

function ban(
  id: string,
  extra?: Partial<BanInteraction>,
): BanInteraction {
  return { id, ...extra } as BanInteraction;
}
function result(id: string, extra?: Partial<BanResult>): BanResult {
  return { id, ...extra } as BanResult;
}
function incoming(id: string, createdAt?: string): QueuedOverlay {
  return {
    kind: 'incoming',
    ban: ban(id, createdAt ? { createdAt } : undefined),
  };
}
function check(id: string, createdAt?: string): QueuedOverlay {
  return {
    kind: 'check',
    ban: ban(id, createdAt ? { createdAt } : undefined),
  };
}
function resultItem(id: string, completedAt?: string): QueuedOverlay {
  return {
    kind: 'result',
    result: result(id, completedAt ? { completedAt } : undefined),
  };
}

function sinks() {
  const writes: Array<{
    queue?: QueuedOverlay[];
    display?: OwnerActiveDisplayPatch;
  }> = [];
  return {
    writes,
    api: {
      writeQueue: (queue: QueuedOverlay[]) => {
        writes.push({ queue });
      },
      writeDisplay: (patch: OwnerActiveDisplayPatch) => {
        writes.push({ display: patch });
      },
    },
  };
}

async function main() {
  // —— success + one item → overlay, no lobby ——
  {
    const store = createNotificationRuntimeStore();
    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h1' });
    assert.equal(req.accepted, true);
    assert.equal(selectIsDraining(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);

    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [incoming('A')],
      },
      api,
    );
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().lifecycle.status, 'showing');
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'incoming:A',
    );
  }

  // —— success + many → first card only (head) ——
  {
    const store = createNotificationRuntimeStore();
    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h-many' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [
          incoming('A', '2020-01-01T00:00:00.000Z'),
          check('B', '2020-01-02T00:00:00.000Z'),
          resultItem('C', '2020-01-03T00:00:00.000Z'),
        ],
      },
      api,
    );
    assert.equal(outcome, 'showing');
    assert.equal(store.getState().items.queue.length, 3);
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'result:C',
    );
    assert.equal(store.getState().display.kind, 'result');
    assert.equal(selectLobbyMayShow(store.getState()), false);
  }

  // —— success + empty → idle → lobbyMayShow ——
  {
    const store = createNotificationRuntimeStore();
    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h-empty' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      { transitionId: req.transitionId, localItems: [] },
      api,
    );
    assert.equal(outcome, 'idle');
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), false);
  }

  // —— success + late prefetch → no lobby flash (stays draining until batch) ——
  {
    const store = createNotificationRuntimeStore();
    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h-late' });
    assert.equal(selectLobbyMayShow(store.getState()), false);

    let resolveFetch!: (items: QueuedOverlay[]) => void;
    const fetchPromise = new Promise<QueuedOverlay[]>((resolve) => {
      resolveFetch = resolve;
    });

    const materializePromise = executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [],
        fetchPendingItems: () => fetchPromise,
      },
      api,
    );

    // While prefetch in flight: draining, no lobby.
    assert.equal(selectIsDraining(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);

    resolveFetch([incoming('LATE')]);
    const outcome = await materializePromise;
    assert.equal(outcome, 'showing');
    assert.equal(selectLobbyMayShow(store.getState()), false);
  }

  // —— duplicate handoff → no-op ——
  {
    const store = createNotificationRuntimeStore();
    const first = requestSuccessHandoff(store, { transitionId: 'dup-h' });
    assert.equal(first.accepted, true);
    const second = requestSuccessHandoff(store, { transitionId: 'dup-h' });
    assert.equal(second.accepted, false);
    assert.equal(store.getState().lifecycle.transitionId, 'dup-h');
    assert.equal(selectIsDraining(store.getState()), true);
  }

  // —— duplicate / stale batch → ignored ——
  {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'batch-a' });
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'batch-stale',
      items: [{ kind: 'incoming', ban: ban('STALE') }],
      replaceQueue: true,
      source: 'poll',
    });
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(selectIsDraining(store.getState()), true);

    store.dispatch({
      type: 'DRAIN_FAILED',
      transitionId: 'batch-stale',
      errorCode: 'STALE',
      source: 'poll',
    });
    assert.equal(selectIsDraining(store.getState()), true);
  }

  // —— live during success (pending) → after success materialize ——
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:LIVE'], 'websocket');
    // Live must not force overlay while idle (SUCCESS screen owns UI).
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);

    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h-live' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [incoming('LIVE')],
      },
      api,
    );
    assert.equal(outcome, 'showing');
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'incoming:LIVE',
    );
  }

  // —— stale batch after newer handoff ——
  {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'newer' });
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'older',
      items: [{ kind: 'check', ban: ban('OLD') }],
      replaceQueue: true,
      source: 'poll',
    });
    assert.equal(store.getState().items.queue.length, 0);

    const { api } = sinks();
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: 'newer',
        localItems: [incoming('NEW')],
      },
      api,
    );
    assert.equal(outcome, 'showing');
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'incoming:NEW',
    );
  }

  // —— prefetch failure → DRAIN_FAILED → idle → lobbyMayShow ——
  {
    const store = createNotificationRuntimeStore();
    const { api } = sinks();
    const req = requestSuccessHandoff(store, { transitionId: 'h-fail' });
    const outcome = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [],
        fetchPendingItems: async () => {
          throw new Error('network');
        },
      },
      api,
    );
    assert.equal(outcome, 'failed');
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // —— go-to-bans must not interrupt draining (policy: drain → idle → bans) ——
  {
    const store = createNotificationRuntimeStore();
    requestSuccessHandoff(store, { transitionId: 'h-bans' });
    assert.equal(selectIsDraining(store.getState()), true);
    // LOBBY_REQUESTED while draining must not clear drain (bans waits for idle).
    store.dispatch({
      type: 'LOBBY_REQUESTED',
      transitionId: 'bans-click',
      source: 'user',
    });
    assert.equal(
      selectIsDraining(store.getState()),
      true,
      'go-to-bans must not abort draining',
    );
  }

  // —— queue ordering unchanged (timestamp DESC; tie result > check > incoming) ——
  {
    const t = '2020-06-01T12:00:00.000Z';
    const sorted = sortQueuedForSuccessDrain([
      incoming('i', t),
      check('c', t),
      resultItem('r', t),
    ]);
    assert.deepEqual(
      sorted.map((x) =>
        x.kind === 'result' ? `result:${x.result.id}` : `${x.kind}:${x.ban.id}`,
      ),
      ['result:r', 'check:c', 'incoming:i'],
    );
  }

  // —— Source scans ——
  {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );
    const flow = readFileSync(
      join(webSrc, 'components/instant-ban/InstantBanFlow.tsx'),
      'utf8',
    );
    const handoff = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.success-handoff.ts'),
      'utf8',
    );
    const storeSrc = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.store.ts'),
      'utf8',
    );

    // One success handoff owner
    assert.match(handoff, /SUCCESS_HANDOFF_REQUESTED/);
    assert.match(handoff, /export function requestSuccessHandoff/);
    assert.match(handoff, /export async function executeSuccessHandoffMaterialize/);
    assert.match(providers, /requestSuccessHandoff/);
    assert.match(providers, /executeSuccessHandoffMaterialize/);
    assert.match(providers, /Vertical 5: runtime SUCCESS_HANDOFF is sole drain owner/);

    // drainNextNotificationAfterSuccess body must not call Legacy continue/showNext
    const drainFnStart = providers.indexOf(
      'const drainNextNotificationAfterSuccess = useCallback(',
    );
    assert.ok(drainFnStart > 0);
    const drainFnEnd = providers.indexOf(
      'const releaseNotificationQueueAfterReplyParentActive = useCallback',
      drainFnStart,
    );
    assert.ok(drainFnEnd > drainFnStart);
    const drainFn = providers.slice(drainFnStart, drainFnEnd);
    assert.doesNotMatch(drainFn, /continueNotificationChainOrOpenLobby/);
    assert.doesNotMatch(drainFn, /showNextNotificationFromChainSync/);
    assert.match(drainFn, /requestSuccessHandoff/);
    assert.match(drainFn, /executeSuccessHandoffMaterialize/);
    assert.match(drainFn, /success-exit-v5-transport/);

    // InstantBanFlow: no Legacy release/unlock as success drain owner
    assert.match(
      flow,
      /do not releaseStartupInteractions \/ unlockNotificationQueueAndFlush as drain owners/,
    );
    assert.doesNotMatch(
      flow,
      /releaseStartupInteractions\(\{\s*force:\s*true\s*\}\);\s*\n\s*logOverlayPriority\('send-success-unlock'/,
    );
    assert.match(flow, /selectIsDraining\(notificationRuntimeState\)/);
    assert.match(flow, /selectLobbyMayShow/);
    assert.match(flow, /planLobbyBansOpenNavigation/);
    const bansNav = readFileSync(
      join(process.cwd(), 'apps/web/src/lib/lobby-bans-open-navigation.ts'),
      'utf8',
    );
    assert.match(bansNav, /runtime-draining/);

    // Prefetch is transport only in handoff helper
    assert.match(handoff, /Prefetch is transport only/);
    assert.match(handoff, /fetchPendingItems/);
    assert.doesNotMatch(handoff, /showNextNotificationFromChainSync/);
    assert.doesNotMatch(handoff, /continueNotificationChainOrOpenLobby/);
    assert.doesNotMatch(handoff, /setLobbyOpen/);

    // Ordering via existing mergeStartupPendingChain
    assert.match(handoff, /mergeStartupPendingChain/);

    // Runtime lifecycle owns draining + stale batch ignore
    assert.match(storeSrc, /seenSuccessHandoffTransitionIds/);
    assert.match(storeSrc, /Stale batch/);

    // No feature gate
    assert.doesNotMatch(
      providers,
      /FEATURE_FLAG.*success.?handoff|USE_NEW_SUCCESS_DRAIN/i,
    );
  }

  console.log('notification-runtime-v5-success-handoff.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
