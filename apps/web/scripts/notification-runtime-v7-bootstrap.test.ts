/**
 * Vertical 7 — bootstrap / recovery single owner tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v7-bootstrap.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  completeBootstrap,
  failBootstrap,
  pendingIdsFromBootstrapItems,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import { requestDirectEntry } from '../src/notification-runtime/notification-runtime.direct-entry';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectIndicatorVisible,
  selectIsBooting,
  selectIsDirectEntry,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingItemIds,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';

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
  // 1. Cold empty → idle + lobby
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store, { source: 'bootstrap' });
    assert.equal(selectIsBooting(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    const out = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [],
        pendingItemIds: [],
        mode: 'normal',
      },
      sinks(),
    );
    assert.equal(out, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectIndicatorVisible(store.getState()), false);
  }

  // 2. Cold pending normal → badge, no auto-show
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const items = [incoming('N1'), check('N2')];
    const out = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items,
        pendingItemIds: pendingIdsFromBootstrapItems(items),
        mode: 'normal',
      },
      sinks(),
    );
    assert.equal(out, 'idle');
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.deepEqual(selectPendingItemIds(store.getState()), [
      'incoming:N1',
      'check:N2',
    ]);
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // 3. Cold pending realtime → auto-show
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const items = [incoming('R1'), check('R2')];
    const out = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items,
        pendingItemIds: pendingIdsFromBootstrapItems(items),
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(out, 'showing');
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:R1');
    assert.equal(selectIndicatorVisible(store.getState()), true);
  }

  // 4. Cold deeplink priority over boot snapshot
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'DL',
        targetKind: 'incoming',
        entrySource: 'deeplink',
        item: incoming('DL'),
      },
      sinks(),
    );
    assert.equal(selectIsDirectEntry(store.getState()), true);
    const req = requestBootstrap(store);
    assert.equal(req.preservedDirect, true);
    assert.equal(selectIsDirectEntry(store.getState()), true);
    const out = completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('OTHER')],
        pendingItemIds: ['incoming:OTHER', 'incoming:DL'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(out, 'preserved-direct');
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:DL');
    assert.ok(selectPendingItemIds(store.getState()).includes('incoming:OTHER'));
  }

  // 5. Reload queue — fresh bootstrap replaces mid-flight
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'old',
      items: [incoming('OLD')],
      replaceQueue: true,
      source: 'poll',
    });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-1',
      targetItemId: 'incoming:OLD',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    // Force showing+action then bootstrap wipe
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'seed',
      items: [check('MID')],
      replaceQueue: true,
      source: 'poll',
    });
    const req = requestBootstrap(store);
    assert.equal(store.getState().lifecycle.status, 'booting');
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(store.getState().action.status, 'idle');
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('NEW')],
        pendingItemIds: ['incoming:NEW'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:NEW');
  }

  // 6. Reload consumed — never resurrects into display
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('C1'), incoming('C2')],
        pendingItemIds: ['incoming:C1', 'incoming:C2'],
        consumedItemIds: ['incoming:C1'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:C2');
    assert.ok(!selectPendingItemIds(store.getState()).includes('incoming:C1'));
    assert.ok(store.getState().consumed.itemIds.includes('incoming:C1'));
  }

  // 7. Reload during action — submitting not restored
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'a1',
      items: [check('ACT')],
      replaceQueue: true,
      source: 'poll',
    });
    store.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'act-cmd',
      targetItemId: 'check:ACT',
      action: 'check_answer',
      completed: true,
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'submitting');
    const req = requestBootstrap(store);
    assert.equal(store.getState().action.status, 'idle');
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [check('ACT')],
        pendingItemIds: ['check:ACT'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(store.getState().lifecycle.status, 'showing');
    assert.equal(store.getState().action.status, 'idle');
  }

  // 8. Reload during drain — half-drain not restored
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'SUCCESS_HANDOFF_REQUESTED',
      transitionId: 'drain-1',
      source: 'user',
    });
    assert.equal(store.getState().lifecycle.status, 'draining');
    const req = requestBootstrap(store);
    assert.equal(store.getState().lifecycle.status, 'booting');
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [],
        pendingItemIds: [],
        mode: 'normal',
      },
      sinks(),
    );
    assert.equal(store.getState().lifecycle.status, 'idle');
  }

  // 9. Reload during direct — deeplink preserved
  {
    const store = createNotificationRuntimeStore();
    requestDirectEntry(
      store,
      {
        targetId: 'DX',
        targetKind: 'check',
        entrySource: 'deeplink',
        item: check('DX'),
      },
      sinks(),
    );
    const req = requestBootstrap(store);
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('BOOT')],
        pendingItemIds: ['incoming:BOOT'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(selectIsDirectEntry(store.getState()), true);
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'check:DX');
  }

  // 10. Visibility / WS = new bootstrap (same helper)
  {
    const store = createNotificationRuntimeStore();
    const a = requestBootstrap(store, {
      transitionId: 'vis-1',
      source: 'recovery',
    });
    const b = requestBootstrap(store, {
      transitionId: 'vis-2',
      source: 'websocket',
    });
    assert.equal(a.accepted, true);
    assert.equal(b.accepted, true);
    // Stale first complete ignored
    const stale = completeBootstrap(store, {
      transitionId: a.transitionId,
      items: [incoming('STALE')],
      pendingItemIds: ['incoming:STALE'],
      mode: 'real-time',
    });
    assert.equal(stale, 'stale');
    const fresh = completeBootstrap(
      store,
      {
        transitionId: b.transitionId,
        items: [incoming('FRESH')],
        pendingItemIds: ['incoming:FRESH'],
        mode: 'real-time',
      },
      sinks(),
    );
    assert.equal(fresh, 'showing');
    assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:FRESH');
  }

  // 11. Duplicate bootstrap — newer wins
  {
    const store = createNotificationRuntimeStore();
    const first = requestBootstrap(store, { transitionId: 'dup-a' });
    const second = requestBootstrap(store, { transitionId: 'dup-b' });
    assert.notEqual(first.transitionId, second.transitionId);
    assert.equal(store.getState().recovery.transitionId, 'dup-b');
  }

  // 12. Stale bootstrap ignored
  {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store, { transitionId: 'live' });
    const out = completeBootstrap(store, {
      transitionId: 'dead',
      items: [incoming('X')],
      pendingItemIds: ['incoming:X'],
      mode: 'real-time',
    });
    assert.equal(out, 'stale');
    assert.equal(selectIsBooting(store.getState()), true);
  }

  // 13. Repair queue/display
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    completeBootstrap(
      store,
      {
        transitionId: req.transitionId,
        items: [incoming('REP'), check('REP2')],
        pendingItemIds: ['incoming:REP', 'check:REP2'],
        mode: 'real-time',
      },
      sinks(),
    );
    const s = store.getState();
    assert.equal(s.display.kind, 'incoming');
    assert.equal(s.lifecycle.status, 'showing');
    assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:REP');
  }

  // 14. Consumed never resurrects
  {
    const store = createNotificationRuntimeStore();
    let req = requestBootstrap(store, { transitionId: 'c1' });
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('Z')],
      pendingItemIds: ['incoming:Z'],
      consumedItemIds: ['incoming:Z'],
      mode: 'real-time',
    });
    assert.equal(store.getState().items.queue.length, 0);
    assert.equal(selectIndicatorVisible(store.getState()), false);
    req = requestBootstrap(store, { transitionId: 'c2' });
    completeBootstrap(store, {
      transitionId: req.transitionId,
      items: [incoming('Z')],
      pendingItemIds: ['incoming:Z'],
      mode: 'real-time',
    });
    // Consumed retained across hard boot → still filtered
    assert.equal(store.getState().items.queue.length, 0);
    assert.ok(store.getState().consumed.itemIds.includes('incoming:Z'));
  }

  // 15. Normal no auto-show / realtime auto-show (explicit)
  {
    const storeN = createNotificationRuntimeStore();
    const rn = requestBootstrap(storeN);
    completeBootstrap(storeN, {
      transitionId: rn.transitionId,
      items: [resultItem('RN')],
      pendingItemIds: ['result:RN'],
      mode: 'normal',
    });
    assert.equal(selectOverlayVisible(storeN.getState()), false);

    const storeR = createNotificationRuntimeStore();
    const rr = requestBootstrap(storeR);
    completeBootstrap(storeR, {
      transitionId: rr.transitionId,
      items: [resultItem('RR')],
      pendingItemIds: ['result:RR'],
      mode: 'real-time',
    });
    assert.equal(selectOverlayVisible(storeR.getState()), true);
  }

  // 16. BOOTSTRAP_FAILED → idle + lobbyMayShow
  {
    const store = createNotificationRuntimeStore();
    const req = requestBootstrap(store);
    const out = failBootstrap(store, { transitionId: req.transitionId }, sinks());
    assert.equal(out, 'failed');
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectLobbyMayShow(store.getState()), true);
    assert.equal(store.getState().recovery.status, 'failed');
  }

  // 17. One bootstrap owner / one lobby owner (selectors)
  {
    const store = createNotificationRuntimeStore();
    requestBootstrap(store);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    // Lobby only when idle — single owner selector
    assert.equal(
      selectLobbyMayShow(store.getState()),
      store.getState().lifecycle.status === 'idle' &&
        !selectOverlayVisible(store.getState()),
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
    const bootstrap = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.bootstrap.ts'),
      'utf8',
    );
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );
    const selectors = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.selectors.ts'),
      'utf8',
    );

    assert.match(types, /BOOTSTRAP_REQUESTED/);
    assert.match(types, /BOOTSTRAP_SNAPSHOT_RECEIVED/);
    assert.match(types, /BOOTSTRAP_COMPLETED/);
    assert.match(types, /BOOTSTRAP_FAILED/);
    assert.match(reducer, /preserveDirect/);
    assert.match(reducer, /repairQueueDisplayInvariant/);
    assert.match(reducer, /autoShow/);
    assert.match(bootstrap, /requestBootstrap/);
    assert.match(bootstrap, /completeBootstrap/);
    assert.match(bootstrap, /failBootstrap/);
    assert.doesNotMatch(bootstrap, /setLobbyOpen/);
    assert.doesNotMatch(bootstrap, /releaseStartupInteractions/);
    assert.match(providers, /requestBootstrap/);
    assert.match(providers, /completeBootstrap/);
    assert.match(providers, /v7-bootstrap/);
    assert.match(selectors, /selectIsBooting/);
    assert.match(selectors, /selectLobbyMayShow/);

    // Startup hold no longer boot authority in bootstrap helper
    assert.doesNotMatch(bootstrap, /startupInteractionsHold/);
    // pendingStartup not an authority in bootstrap module
    assert.doesNotMatch(bootstrap, /pendingStartup/);
  }

  console.log('notification-runtime-v7-bootstrap: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
