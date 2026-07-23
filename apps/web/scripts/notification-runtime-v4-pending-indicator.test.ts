/**
 * Vertical 4 — canonical pending indicator (pending − consumed).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v4-pending-indicator.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  ingestPendingSnapshot,
  markRuntimeItemConsumed,
  mergePendingItemIds,
  normalizePendingItemIds,
  pendingIdsFromPrefetchParts,
} from '../src/notification-runtime/notification-runtime.pending';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectHasPending,
  selectIndicatorVisible,
  selectPendingCount,
  selectPendingItemIds,
} from '../src/notification-runtime/notification-runtime.selectors';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function main() {
  // 2. Basic pending
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.equal(selectHasPending(store.getState()), true);
  }

  // 3. Consumed
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    assert.equal(selectIndicatorVisible(store.getState()), false);
    assert.deepEqual(selectPendingItemIds(store.getState()), []);
  }

  // 4. Late refresh cannot resurrect
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test', 'v1');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    ingestPendingSnapshot(store, ['incoming:A'], 'poll', 'v2');
    assert.equal(selectIndicatorVisible(store.getState()), false);
    assert.ok(store.getState().consumed.itemIds.includes('incoming:A'));
  }

  // 5. Two items, one consumed
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A', 'check:B'], 'test');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    assert.equal(selectPendingCount(store.getState()), 1);
    assert.deepEqual(selectPendingItemIds(store.getState()), ['check:B']);
    assert.equal(selectIndicatorVisible(store.getState()), true);
  }

  // 6. Duplicate ingest
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A', 'incoming:A'], 'test');
    assert.equal(selectPendingCount(store.getState()), 1);
    mergePendingItemIds(store, ['incoming:A'], 'websocket');
    assert.equal(selectPendingCount(store.getState()), 1);
  }

  // 7. Duplicate consume
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    assert.equal(store.getState().consumed.itemIds.filter((x) => x === 'incoming:A').length, 1);
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 8. Queue length alone → false (queue not badge authority)
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'q-only',
      items: [incoming('Q')],
      replaceQueue: true,
      source: 'test',
    });
    assert.equal(store.getState().items.queue.length, 1);
    assert.equal(store.getState().pending.itemIds.length, 0);
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 9–10. Legacy hint / localStorage alone → false (runtime empty)
  {
    const store = createNotificationRuntimeStore();
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 11. Server count without ids → no synthetic pending
  {
    const ids = pendingIdsFromPrefetchParts({
      incomingIds: [],
      checkId: null,
      resultId: null,
    });
    assert.deepEqual(ids, []);
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ids, 'test');
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 12. Live duplicate same stable id
  {
    const store = createNotificationRuntimeStore();
    mergePendingItemIds(store, ['incoming:A'], 'websocket');
    mergePendingItemIds(store, ['incoming:A'], 'websocket');
    assert.equal(selectPendingCount(store.getState()), 1);
  }

  // 13. Deeplink consumed then normal ingest
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'deeplink');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    ingestPendingSnapshot(store, ['incoming:A'], 'bootstrap');
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 14. Consume "API failure" — local tombstone stays (no clear)
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    // Simulate failed transport: do nothing to consumed
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 15. Queue completion does not clear consumed / resurrect
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'qc',
      items: [incoming('A')],
      replaceQueue: true,
      source: 'drain',
    });
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 'qc-d',
      targetItemId: 'incoming:A',
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.ok(store.getState().consumed.itemIds.includes('incoming:A'));
    ingestPendingSnapshot(store, ['incoming:A'], 'poll');
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 16. Lobby navigation — LOBBY_REQUESTED does not clear consumed
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A'], 'test');
    markRuntimeItemConsumed(store, 'incoming:A', 'user');
    store.dispatch({ type: 'LOBBY_REQUESTED', source: 'user' });
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // normalize helper
  {
    assert.deepEqual(
      normalizePendingItemIds(['incoming:A', '', 'incoming:A', 'incoming:']),
      ['incoming:A'],
    );
  }

  // dismiss path consumes head id
  {
    const store = createNotificationRuntimeStore();
    ingestPendingSnapshot(store, ['incoming:A', 'incoming:B'], 'test');
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'd1',
      items: [incoming('A'), incoming('B')],
      replaceQueue: true,
      source: 'drain',
    });
    store.dispatch({
      type: 'CARD_DISMISS_REQUESTED',
      transitionId: 'd1-d',
      targetItemId: notificationItemId(incoming('A')),
      reason: 'user_dismiss',
      source: 'user',
    });
    assert.ok(store.getState().consumed.itemIds.includes('incoming:A'));
    assert.equal(selectPendingCount(store.getState()), 1);
  }

  // —— Source scans ——
  {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const providers = readFileSync(join(webSrc, 'components/Providers.tsx'), 'utf8');
    const flow = readFileSync(
      join(webSrc, 'components/instant-ban/InstantBanFlow.tsx'),
      'utf8',
    );
    const topNav = readFileSync(
      join(webSrc, 'components/instant-ban/ArenaLobbyTopNav.tsx'),
      'utf8',
    );

    assert.match(providers, /selectIndicatorVisible\(notificationRuntimeState\)/);
    assert.match(providers, /ingestPendingSnapshot/);
    assert.match(providers, /Vertical 4: sole pending badge ingest/);
    assert.doesNotMatch(
      providers,
      /lobbyBansNeedAttention\s*=\s*\n?\s*ownerPrimaryShellPendingLen/,
    );
    assert.doesNotMatch(
      providers,
      /setLobbyBansAttentionHint\(\(prev\) => Math\.max/,
    );
    assert.doesNotMatch(
      providers,
      /persistLobbyNotificationAttentionHint\(uid,\s*total\)/,
    );
    assert.match(flow, /selectIndicatorVisible/);
    assert.match(flow, /bansNeedAttention=\{bansIndicatorVisible\}/);
    assert.match(topNav, /bansNeedAttention/);
    assert.doesNotMatch(providers, /FEATURE_FLAG.*pending.?indicator|USE_NEW_PENDING_BADGE/i);
  }

  console.log('notification-runtime-v4-pending-indicator.test.ts: ok');
}

main();
