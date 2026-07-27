/**
 * Vertical 8 — Legacy demolition / single runtime authority tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v8-demolition.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  selectRuntimePaintSnapshot,
  runtimePaintIds,
} from '../src/notification-runtime/notification-runtime.demolition';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';
import {
  requestDirectEntry,
  completeDirectSessionViaDismiss,
} from '../src/notification-runtime/notification-runtime.direct-entry';
import {
  requestSuccessHandoff,
  executeSuccessHandoffMaterialize,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectHasPending,
  selectIndicatorVisible,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import type { OwnerActiveDisplayPatch } from '../src/lib/notification-overlay-owner';
import type { QueuedOverlay } from '../src/lib/overlay-queue';

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
  // 1. Queue authority — paint queue === runtime.items.queue
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'q1',
      items: [incoming('A'), check('B')],
      replaceQueue: true,
      source: 'poll',
    });
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.queueLength, 2);
    assert.equal(paint.queueHead?.kind, 'incoming');
    assert.equal(paint.overlayVisible, true);
    assert.equal(paint.lobbyMayShow, false);
  }

  // 2. Display authority — paint display from runtime.display only
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'd1',
      items: [check('C')],
      replaceQueue: true,
      source: 'poll',
    });
    const ids = runtimePaintIds(store.getState());
    assert.equal(ids.checkId, 'C');
    assert.equal(ids.incomingId, null);
    assert.equal(ids.headId, 'check:C');
  }

  // 3. Pending authority — badge from runtime.pending − consumed
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'PENDING_SOURCE_UPDATED',
      itemIds: ['incoming:P1', 'check:P2'],
      sourceVersion: 'v',
      source: 'poll',
    });
    store.dispatch({
      type: 'ITEM_CONSUMED',
      itemId: 'incoming:P1',
      source: 'user',
    });
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.pendingCount, 1);
    assert.equal(selectIndicatorVisible(store.getState()), true);
    assert.equal(selectHasPending(store.getState()), true);
  }

  // 4. Bootstrap (normal / realtime)
  {
    const storeN = createNotificationRuntimeStore();
    const rn = requestBootstrap(storeN);
    completeBootstrap(storeN, {
      transitionId: rn.transitionId,
      items: [incoming('BN')],
      pendingItemIds: ['incoming:BN'],
      mode: 'normal',
    });
    assert.equal(selectOverlayVisible(storeN.getState()), false);
    assert.equal(selectPendingCount(storeN.getState()), 1);

    const storeR = createNotificationRuntimeStore();
    const rr = requestBootstrap(storeR);
    completeBootstrap(storeR, {
      transitionId: rr.transitionId,
      items: [incoming('BR')],
      pendingItemIds: ['incoming:BR'],
      mode: 'real-time',
    });
    assert.equal(selectOverlayVisible(storeR.getState()), true);
  }

  // 5. Success handoff still runtime-owned
  {
    const store = createNotificationRuntimeStore();
    const req = requestSuccessHandoff(store, { source: 'user' });
    assert.equal(req.accepted, true);
    const out = await executeSuccessHandoffMaterialize(
      store,
      {
        transitionId: req.transitionId,
        localItems: [{ kind: 'incoming', ban: ban('S1') }],
      },
      sinks(),
    );
    assert.equal(out, 'showing');
    assert.equal(selectLobbyMayShow(store.getState()), false);
  }

  // 6. Deeplink / live
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
    assert.equal(selectOverlayVisible(store.getState()), true);
    completeDirectSessionViaDismiss(
      store,
      { targetItemId: 'incoming:DL' },
      sinks(),
    );
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // 7. Check / result paint ids
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'cr',
      items: [resultItem('RX')],
      replaceQueue: true,
      source: 'poll',
    });
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.display.result?.id, 'RX');
    assert.equal(paint.display.directResultOverlay, false);
  }

  // 8. Recovery / poll ingest via ITEMS_RECEIVED (no second owner)
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'poll-1',
      items: [incoming('W1')],
      replaceQueue: true,
      source: 'websocket',
    });
    assert.equal(
      notificationItemId(store.getState().items.queue[0]!),
      'incoming:W1',
    );
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.queueLength, store.getState().items.queue.length);
  }

  // 9. No duplicate owner — one queue length source
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'one',
      items: [incoming('1'), incoming('2')],
      replaceQueue: true,
      source: 'system',
    });
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.queueLength, store.getState().items.queue.length);
    assert.equal(paint.queueLength, 2);
  }

  // —— Source scans ——
  {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const demolition = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.demolition.ts'),
      'utf8',
    );
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );
    const adapters = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.adapters.ts'),
      'utf8',
    );
    const advance = readFileSync(
      join(
        webSrc,
        'notification-runtime/notification-runtime.production-advance.ts',
      ),
      'utf8',
    );

    assert.match(demolition, /selectRuntimePaintSnapshot/);
    assert.match(demolition, /Sole production notification paint/);
    assert.doesNotMatch(demolition, /setLobbyOpen/);
    assert.doesNotMatch(demolition, /ownerShadow/);
    assert.doesNotMatch(demolition, /pendingStartup/);

    // Paint cutover: primary cards from runtimePaint
    assert.match(providers, /selectRuntimePaintSnapshot/);
    assert.match(providers, /ownerPrimaryIncomingBan = runtimePaint\.display\.incomingBan/);
    assert.match(providers, /ownerPrimaryCheckBan = runtimePaint\.display\.checkBan/);
    assert.match(providers, /ownerPrimaryResult = runtimePaint\.display\.result/);
    assert.match(providers, /ownerPrimaryQueueLen = runtimePaint\.queueLength/);
    assert.match(providers, /overlayQueueLength: notificationRuntimeUi\.queueLength/);
    assert.match(providers, /v8-startup-release/);
    assert.match(providers, /v8-unlock-flush/);
    assert.match(providers, /Vertical 8: unlock flush is transport/);

    // Adapters / sinks are TEMP write-through, not authority
    assert.match(adapters, /Vertical 8/);
    assert.match(advance, /Vertical 8/);
    assert.match(advance, /must not decide next card/);
  }

  console.log('notification-runtime-v8-demolition: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
