/**
 * Vertical 6 — deeplink / live-single direct entry tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v6-direct-entry.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/lib/notification-overlay-owner';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  applyDirectItemReceived,
  completeDirectSessionViaDismiss,
  failDirectItem,
  flushDeferredDirectEntry,
  requestDirectEntry,
  toDirectNotificationItem,
} from '../src/notification-runtime/notification-runtime.direct-entry';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectHasDeferredDirectEntry,
  selectIndicatorVisible,
  selectIsDirectEntry,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingItemIds,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import { ingestPendingSnapshot } from '../src/notification-runtime/notification-runtime.pending';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}
function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}
function resultItem(id: string): NotificationItem {
  return { kind: 'result', result: result(id) };
}

function sinks() {
  return {
    writeQueue: (_q: QueuedOverlay[]) => {},
    writeDisplay: (_p: OwnerActiveDisplayPatch) => {},
  };
}

async function main() {
  // 1. Cold incoming deeplink → direct card
  {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(
      store,
      {
        targetId: 'A',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('A'),
      },
      sinks(),
    );
    assert.equal(req.outcome, 'showing');
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assert.equal(store.getState().display.mode, 'direct');
  }

  // 2. Warm — same path, no lobby while showing
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'B',
        targetKind: 'check',
        entrySource: 'deeplink',
        item: check('B'),
      },
      sinks(),
    );
    assert.equal(selectLobbyMayShow(store.getState()), false);
  }

  // 3. Duplicate transitionId → one entry
  {
    const store = createNotificationRuntimeStore();
    const tid = 'dup-entry';
    const a = requestDirectEntry(store, {
      transitionId: tid,
      targetId: 'C',
      targetKind: 'incoming',
      entrySource: 'deeplink',
    });
    assert.equal(a.accepted, true);
    const b = requestDirectEntry(store, {
      transitionId: tid,
      targetId: 'C',
      targetKind: 'incoming',
      entrySource: 'deeplink',
    });
    assert.equal(b.accepted, false);
    assert.equal(store.getState().directEntry.transitionId, tid);
  }

  // 4–5. Same item deeplink + pending / queue → one head id
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'seed',
      items: [incoming('D'), check('E')],
      replaceQueue: true,
      source: 'poll',
    });
    requestDirectEntry(
      store,
      {
        targetId: 'D',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('D'),
      },
      sinks(),
    );
    const q = store.getState().items.queue;
    assert.equal(notificationItemId(q[0]!), 'incoming:D');
    assert.equal(
      q.filter((x) => notificationItemId(x) === 'incoming:D').length,
      1,
    );
  }

  // 6. Already consumed → no card, lobby
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:F',
      source: 'user',
    });
    const req = requestDirectEntry(
      store,
      {
        targetId: 'F',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('F'),
      },
      sinks(),
    );
    assert.equal(req.outcome, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), false);
  }

  // 7. Consumed while fetch in flight → no card
  {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(store, {
      targetId: 'G',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'g1',
    });
    assert.equal(store.getState().lifecycle.status, 'recovering');
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:G',
      source: 'user',
    });
    const out = applyDirectItemReceived(
      store,
      { transitionId: req.transitionId, item: incoming('G') },
      sinks(),
    );
    assert.equal(out, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // 8. Delayed fetch — recovering has no overlay / no lobby flash
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(store, {
      targetId: 'H',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'h1',
    });
    assert.equal(store.getState().lifecycle.status, 'recovering');
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectLobbyMayShow(store.getState()), false);
  }

  // 9. Stale fetch ignored
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(store, {
      targetId: 'I',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'i-new',
    });
    applyDirectItemReceived(
      store,
      { transitionId: 'i-old', item: incoming('STALE') },
      sinks(),
    );
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(store.getState().lifecycle.status, 'recovering');
  }

  // 10. Second request while first loading → deferred (newer)
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(store, {
      targetId: 'J1',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'j1',
    });
    const second = requestDirectEntry(store, {
      targetId: 'J2',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'j2',
    });
    assert.equal(second.outcome, 'deferred');
    assert.equal(store.getState().directEntry.deferred?.targetId, 'J2');
    assert.equal(store.getState().directEntry.transitionId, 'j1');
  }

  // 11. Second while first showing → first not interrupted
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'K1',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        transitionId: 'k1',
        item: incoming('K1'),
      },
      sinks(),
    );
    assert.equal(selectIsDirectEntry(store.getState()), true);
    requestDirectEntry(store, {
      targetId: 'K2',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'k2',
    });
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'incoming:K1',
    );
    assert.equal(store.getState().directEntry.deferred?.targetId, 'K2');
  }

  // 12–13. Deeplink during SUCCESS / V5 draining → deferred
  {
    const store = createNotificationRuntimeStore();
    const deferredHost = requestDirectEntry(store, {
      targetId: 'L',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      defer: true,
      transitionId: 'l1',
    });
    assert.equal(deferredHost.outcome, 'deferred');

    store.dispatch({
      type: 'SUCCESS_HANDOFF_REQUESTED',
      transitionId: 'drain1',
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'draining');
    const duringDrain = requestDirectEntry(store, {
      targetId: 'M',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'm1',
    });
    assert.equal(duringDrain.outcome, 'deferred');
    // Draining without a renderable display does not claim the overlay host.
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(store.getState().items.queue.length, 0);
  }

  // 14–15. Check waiting stays; result replacement keeps direct
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'N',
        targetKind: 'check',
        entrySource: 'deeplink',
        item: check('N'),
      },
      sinks(),
    );
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-n',
      targetItemId: 'check:N',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'submitting');
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-n',
      targetItemId: 'check:N',
      source: 'user',
    });
    assert.equal(store.getState().display.kind, 'check');
    assert.equal(selectIsDirectEntry(store.getState()), true);

    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-n',
      targetItemId: 'check:N',
      replacement: resultItem('N'),
      source: 'user',
    });
    // Note: second SUCCEEDED with same command may no-op if action already succeeded.
    // Use fresh path: reset action via direct receive of result after waiting.
  }

  // Atomic check→result in direct (fresh action cycle)
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'N2',
        targetKind: 'check',
        entrySource: 'deeplink',
        item: check('N2'),
      },
      sinks(),
    );
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-n2',
      targetItemId: 'check:N2',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-n2',
      targetItemId: 'check:N2',
      replacement: resultItem('N2'),
      source: 'user',
    });
    assert.equal(store.getState().display.kind, 'result');
    assert.equal(store.getState().display.mode, 'direct');
    assert.equal(selectIsDirectEntry(store.getState()), true);
  }

  // 16–18. Result close → lobby; remainder → pending; no auto-continue
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'seed2',
      items: [incoming('R1'), incoming('R2')],
      replaceQueue: true,
      source: 'poll',
    });
    requestDirectEntry(
      store,
      {
        targetId: 'RX',
        targetKind: 'result',
        entrySource: 'deeplink',
        item: resultItem('RX'),
      },
      sinks(),
    );
    assert.equal(store.getState().items.queue.length, 3);
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'result:RX',
    );
    const done = completeDirectSessionViaDismiss(
      store,
      { targetItemId: 'result:RX', reason: 'close_result' },
      sinks(),
    );
    assert.equal(done.lobbyMayShow, true);
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.ok(selectPendingItemIds(store.getState()).includes('incoming:R1'));
    assert.ok(selectPendingItemIds(store.getState()).includes('incoming:R2'));
    assert.equal(selectIsDirectEntry(store.getState()), false);
  }

  // 19. Badge reflects deferred remainder
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'seed3',
      items: [incoming('P1')],
      replaceQueue: true,
      source: 'poll',
    });
    requestDirectEntry(
      store,
      {
        targetId: 'PX',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('PX'),
      },
      sinks(),
    );
    completeDirectSessionViaDismiss(
      store,
      { targetItemId: 'incoming:PX' },
      sinks(),
    );
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.deepEqual(selectPendingItemIds(store.getState()), ['incoming:P1']);
  }

  // 20–21. Live single via runtime; duplicate one item
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'LIVE',
        targetKind: 'incoming',
        entrySource: 'live-single',
        item: incoming('LIVE'),
      },
      sinks(),
    );
    assert.equal(store.getState().directEntry.entrySource, 'live-single');
    assert.equal(store.getState().display.mode, 'direct');
    requestDirectEntry(
      store,
      {
        targetId: 'LIVE',
        targetKind: 'incoming',
        entrySource: 'live-single',
        item: incoming('LIVE'),
        transitionId: 'live-2',
      },
      sinks(),
    );
    assert.equal(
      store.getState().items.queue.filter(
        (x) => notificationItemId(x) === 'incoming:LIVE',
      ).length,
      1,
    );
  }

  // 22. Direct failure → lobby via selector
  {
    const store = createNotificationRuntimeStore();
    const req = requestDirectEntry(store, {
      targetId: 'Z',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      transitionId: 'z1',
    });
    const out = failDirectItem(
      store,
      { transitionId: req.transitionId, errorCode: 'NOT_FOUND' },
      sinks(),
    );
    assert.equal(out, 'failed');
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // 23. Flush deferred after idle
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(store, {
      targetId: 'DEF',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      defer: true,
      transitionId: 'def1',
    });
    assert.equal(selectHasDeferredDirectEntry(store.getState()), true);
    const effects = flushDeferredDirectEntry(store, 'system');
    assert.ok(effects.some((e) => e.type === 'FETCH_DIRECT_ITEM'));
    assert.equal(store.getState().lifecycle.status, 'recovering');
    assert.equal(store.getState().directEntry.targetId, 'DEF');
  }

  // toDirectNotificationItem helper
  {
    assert.equal(
      notificationItemId(toDirectNotificationItem('check', ban('T'))),
      'check:T',
    );
  }

  // —— Source scans ——
  {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const types = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.types.ts'),
      'utf8',
    );
    const reducer = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.reducer.ts'),
      'utf8',
    );
    const direct = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.direct-entry.ts'),
      'utf8',
    );
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );

    assert.match(types, /DEEPLINK_ENTRY_REQUESTED/);
    assert.match(types, /DIRECT_ITEM_RECEIVED/);
    assert.match(types, /DIRECT_ITEM_FAILED/);
    assert.match(types, /FETCH_DIRECT_ITEM/);
    assert.match(types, /mode: DisplayMode/);
    assert.match(types, /'direct'/);
    assert.match(reducer, /lobby_after_card/);
    assert.match(reducer, /direct-session-complete/);
    assert.match(direct, /requestDirectEntry/);
    assert.match(direct, /returnPolicy/);
    assert.doesNotMatch(direct, /setLobbyOpen/);
    assert.doesNotMatch(direct, /showNextNotificationFromChainSync/);
    assert.doesNotMatch(direct, /continueNotificationChainOrOpenLobby/);

    // Production wiring markers (updated as Providers is wired)
    assert.match(providers, /requestDirectEntry|v6-direct|Vertical 6/);
  }

  console.log('notification-runtime-v6-direct-entry.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
