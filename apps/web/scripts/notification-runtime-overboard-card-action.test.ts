/**
 * Vertical V2 — overboard as runtime CARD_ACTION (consume + advance).
 *
 * Production after V1: overboard cleared host card, runtime stayed showing,
 * dimming remained, next card never promoted.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-overboard-card-action.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  executeSubmitIncomingOverboardEffect,
  requestIncomingOverboardAction,
} from '../src/notification-runtime/notification-runtime.overboard-action';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationItem,
} from '../src/notification-runtime/notification-runtime.types';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';

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
function result(id: string): BanResult {
  return { id } as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function ingest(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  items: NotificationItem[],
) {
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: `ingest:${items.map(notificationItemId).join(',')}`,
    items,
    replaceQueue: true,
    source: 'test',
  });
}

async function overboardOk(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  banId: string,
  transportOk = true,
) {
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
        ? { ok: true, result: result(banId) }
        : { ok: false, error: 'API_FAIL' },
    'tok',
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
}

async function main() {
  console.log('\n=== V2 OVERBOARD RUNTIME CARD ACTION ===\n');

  await spec(
    'A: queue of 3 — first overboard → second card appears',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B'), incoming('C')]);
      assert.equal(store.getState().display.kind, 'incoming');
      assert.equal(
        notificationItemId(store.getState().items.queue[0]!),
        'incoming:A',
      );
      const res = await overboardOk(store, 'A');
      assert.equal(res.ok, true);
      const s = store.getState();
      assert.equal(s.lifecycle.status, 'showing');
      assert.equal(selectOverlayVisible(s), true);
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:B');
      assert.equal(s.display.kind, 'incoming');
      assert.equal(s.items.queue.length, 2);
    },
  );

  await spec(
    'B: second overboard → third card appears',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B'), incoming('C')]);
      await overboardOk(store, 'A');
      const res = await overboardOk(store, 'B');
      assert.equal(res.ok, true);
      const s = store.getState();
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:C');
      assert.equal(s.lifecycle.status, 'showing');
      assert.equal(selectOverlayVisible(s), true);
    },
  );

  await spec(
    'C: final overboard → overlay closes → Lobby may show',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B'), incoming('C')]);
      await overboardOk(store, 'A');
      await overboardOk(store, 'B');
      const res = await overboardOk(store, 'C');
      assert.equal(res.ok, true);
      const s = store.getState();
      assert.equal(s.items.queue.length, 0);
      assert.equal(s.lifecycle.status, 'idle');
      assert.equal(s.display.kind, null);
      assert.equal(selectOverlayVisible(s), false);
      assert.equal(selectLobbyMayShow(s), true);
    },
  );

  await spec(
    'D: API failure → current card remains; queue not lost',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B'), incoming('C')]);
      const res = await overboardOk(store, 'A', false);
      assert.equal(res.ok, false);
      const s = store.getState();
      assert.equal(s.lifecycle.status, 'showing');
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:A');
      assert.equal(s.items.queue.length, 3);
      assert.equal(s.action.status, 'failed');
      assert.equal(selectOverlayVisible(s), true);
    },
  );

  await spec(
    'E: stale legacy owner/display cannot interrupt runtime advance',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B')]);
      await overboardOk(store, 'A');
      // Host/legacy would have called writeOwnerDisplay / silent queue — sinks empty.
      // Runtime head must remain B regardless of imaginary owner queue=5.
      const s = store.getState();
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:B');
      assert.equal(s.lifecycle.status, 'showing');
      const providers = readFileSync(
        join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
        'utf8',
      );
      assert.match(providers, /v2-runtime-card-action|requestIncomingOverboardAction/);
      assert.match(
        providers,
        /replaceIncomingWithOverboardResultAtomic:v2-noop/,
      );
      assert.match(providers, /\[FORCE OVERBOARD\] v2-noop/);
      const overlay = readFileSync(
        join(
          process.cwd(),
          'apps/web/src/components/IncomingBanOverlay.tsx',
        ),
        'utf8',
      );
      assert.match(overlay, /submitIncomingOverboard\(actBan\)/);
      assert.doesNotMatch(
        overlay,
        /openIncomingOverboardOptimistic\(actBan/,
      );
    },
  );

  await spec(
    'F: no permanent dimming overlay with no visible card',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      await overboardOk(store, 'A');
      const s = store.getState();
      assert.equal(s.display.kind, null);
      assert.equal(s.lifecycle.status, 'idle');
      assert.equal(selectOverlayVisible(s), false);
      // Product claim: overlay visible iff lifecycle overlay set — not stuck showing.
      assert.equal(
        selectOverlayVisible(s) && s.display.kind == null,
        false,
        'must not claim overlay without display',
      );
    },
  );

  await spec('reject overboard when current is not incoming', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'ingest-check',
      items: [{ kind: 'check', ban: ban('X') }],
      replaceQueue: true,
      source: 'test',
    });
    const req = requestIncomingOverboardAction(store, { banId: 'X' });
    assert.equal(req.accepted, false);
    assert.equal(req.reason, 'current-not-incoming');
  });

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
