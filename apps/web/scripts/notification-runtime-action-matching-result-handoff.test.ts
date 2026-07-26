/**
 * FIX B — matching overboard result action handoff.
 *
 * B1–B7 cover the proven production sequence:
 *   incoming cms1vmwok… → submit overboard → matching WS result classified
 *   `LIVE OVERLAY BLOCKED reason=normal-mode` → deferred → HTTP 200
 *   CARD_ACTION_SUCCEEDED consumed the head → runtime idle + queue empty
 *   → Lobby orb painted and the result was never materialized.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-action-matching-result-handoff.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  executeSubmitIncomingOverboardEffect,
  requestIncomingOverboardAction,
} from '../src/notification-runtime/notification-runtime.overboard-action';
import {
  getInteractiveCardActionChain,
  isInteractiveCardActionChainBan,
  resetInteractiveCardActionResultHandoffForTest,
  snapshotRuntimeForActionResultHandoff,
  stageMatchingActionResult,
} from '../src/notification-runtime/notification-runtime.action-result-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  resetInteractiveCardActionResultHandoffForTest();
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

type Store = ReturnType<typeof createNotificationRuntimeStore>;

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id, outcome: 'overboard' } as unknown as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function ingest(store: Store, items: NotificationItem[]) {
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: `ingest:${items.map(notificationItemId).join(',')}`,
    items,
    replaceQueue: true,
    source: 'test',
  });
}

/** Mirrors the WS path: receiveResult correlates before any live classification. */
function arriveWsResult(store: Store, banId: string) {
  return stageMatchingActionResult({
    banId,
    result: result(banId),
    source: 'ws',
    runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
  });
}

/**
 * Runs the overboard action, letting the caller inject a WS arrival at a chosen
 * point relative to the HTTP response.
 */
async function submitOverboard(
  store: Store,
  banId: string,
  opts: {
    httpResult?: BanResult | null;
    httpOk?: boolean;
    wsBeforeHttpResolves?: boolean;
  } = {},
) {
  const requested = requestIncomingOverboardAction(store, {
    banId,
    commandId: `cmd-${banId}`,
  });
  assert.equal(requested.accepted, true, `request accepted for ${banId}`);
  const effect = requested.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION');
  assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');

  const stateWhileSubmitting = store.getState();
  return {
    stateWhileSubmitting,
    outcome: await executeSubmitIncomingOverboardEffect(
      store,
      effect,
      async () => {
        if (opts.wsBeforeHttpResolves) arriveWsResult(store, banId);
        return opts.httpOk === false
          ? { ok: false, error: 'API_FAIL' }
          : { ok: true, result: opts.httpResult ?? null };
      },
      'tok',
      EMPTY_RUNTIME_LEGACY_SINKS,
    ),
  };
}

function assertNeverIdleEmpty(state: NotificationRuntimeState, label: string) {
  const idleEmpty =
    state.lifecycle.status === 'idle' &&
    state.display.kind == null &&
    state.items.queue.length === 0;
  assert.equal(idleEmpty, false, `${label}: runtime must not be idle/empty`);
}

const ROOT = join(__dirname, '..');
const providersSrc = readFileSync(
  join(ROOT, 'src/components/Providers.tsx'),
  'utf8',
);
const actionSrc = readFileSync(
  join(ROOT, 'src/notification-runtime/notification-runtime.overboard-action.ts'),
  'utf8',
);
const handoffSrc = readFileSync(
  join(
    ROOT,
    'src/notification-runtime/notification-runtime.action-result-handoff.ts',
  ),
  'utf8',
);

async function main() {
  console.log('\n=== FIX B — MATCHING OVERBOARD RESULT ACTION HANDOFF ===\n');

  await spec(
    'B1: WS matching result arrives before HTTP success → staged, then materialized exactly once',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const { stateWhileSubmitting, outcome } = await submitOverboard(
        store,
        'A',
        { wsBeforeHttpResolves: true },
      );
      assert.equal(stateWhileSubmitting.action.status, 'pending');
      assert.equal(outcome.ok, true);
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(outcome.matchingResultSource, 'ws');

      const s = store.getState();
      assert.equal(s.display.kind, 'result', 'result head must be displayed');
      assert.equal(notificationItemId(s.items.queue[0]!), 'result:A');
      assert.equal(s.items.queue.length, 1, 'exactly one head');
      assert.equal(selectOverlayVisible(s), true);
      assertNeverIdleEmpty(s, 'B1');

      // Incoming was consumed atomically in the same transition.
      assert.ok(s.consumed.itemIds.includes('incoming:A'));

      const chain = getInteractiveCardActionChain('A');
      assert.equal(chain?.status, 'materialized');
      assert.equal(chain?.stagedResult, null, 'staged result handed over once');
    },
  );

  await spec(
    'B2: HTTP success returns the result before WS → materialized from HTTP, later WS deduped',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const { outcome } = await submitOverboard(store, 'A', {
        httpResult: result('A'),
      });
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(outcome.matchingResultSource, 'http');
      assert.equal(store.getState().items.queue.length, 1);

      // Late WS duplicate for the same ban.
      const late = arriveWsResult(store, 'A');
      assert.equal(late.outcome, 'deduped');
      assert.equal(late.reason, 'already-materialized');
      assert.equal(
        store.getState().items.queue.length,
        1,
        'no duplicate card from the late WS result',
      );
      assert.equal(store.getState().display.kind, 'result');
    },
  );

  await spec(
    'B3: WS and HTTP both provide the same result → exactly one runtime head',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const { outcome } = await submitOverboard(store, 'A', {
        wsBeforeHttpResolves: true,
        httpResult: result('A'),
      });
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(
        outcome.matchingResultSource,
        'ws',
        'first transport wins; the second dedupes',
      );

      const s = store.getState();
      assert.equal(s.items.queue.length, 1, 'exactly one runtime head');
      assert.equal(notificationItemId(s.items.queue[0]!), 'result:A');
      assert.equal(
        s.items.queue.filter((i) => i.kind === 'result').length,
        1,
        'no duplicate result card',
      );
    },
  );

  await spec(
    'B4: action succeeds but contract requires no result → explicit completion advances / Lobby',
    async () => {
      const advance = createNotificationRuntimeStore();
      ingest(advance, [incoming('A'), incoming('B')]);
      const advanced = await submitOverboard(advance, 'A');
      assert.equal(advanced.outcome.ok, true);
      assert.equal(advanced.outcome.materializedResultBanId, null);
      const advancedState = advance.getState();
      assert.equal(notificationItemId(advancedState.items.queue[0]!), 'incoming:B');
      assert.equal(advancedState.display.kind, 'incoming');

      resetInteractiveCardActionResultHandoffForTest();

      const toLobby = createNotificationRuntimeStore();
      ingest(toLobby, [incoming('A')]);
      const released = await submitOverboard(toLobby, 'A');
      assert.equal(released.outcome.materializedResultBanId, null);
      const lobbyState = toLobby.getState();
      assert.equal(lobbyState.items.queue.length, 0);
      assert.equal(lobbyState.display.kind, null);
      assert.equal(selectLobbyMayShow(lobbyState), true);

      const chain = getInteractiveCardActionChain('A');
      assert.equal(chain?.status, 'released-without-result');
      assert.equal(
        isInteractiveCardActionChainBan('A'),
        false,
        'a released chain must not claim later results',
      );
    },
  );

  await spec(
    'B5: action fails → incoming retained, no success result materialized, not idle',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B')]);

      const { outcome } = await submitOverboard(store, 'A', {
        httpOk: false,
        wsBeforeHttpResolves: true,
      });
      assert.equal(outcome.ok, false);
      assert.equal(outcome.materializedResultBanId, undefined);

      const s = store.getState();
      assert.equal(s.lifecycle.status, 'showing');
      assert.equal(s.action.status, 'failed');
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:A');
      assert.equal(s.items.queue.length, 2, 'queue preserved');
      assert.equal(s.display.kind, 'incoming', 'incoming card retained');
      assert.equal(
        s.items.queue.some((i) => i.kind === 'result'),
        false,
        'no success result may be materialized after a failed action',
      );
      assertNeverIdleEmpty(s, 'B5');
      assert.equal(
        getInteractiveCardActionChain('A'),
        null,
        'failed action drops the chain so a late result falls back to normal handling',
      );
    },
  );

  await spec(
    'B6: unrelated live result during the action → not correlated, normal handling preserved',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const requested = requestIncomingOverboardAction(store, {
        banId: 'A',
        commandId: 'cmd-A',
      });
      assert.equal(requested.accepted, true);

      const unrelated = stageMatchingActionResult({
        banId: 'ZZZ-unrelated',
        result: result('ZZZ-unrelated'),
        source: 'ws',
        runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
      });
      assert.equal(unrelated.outcome, 'not-correlated');
      assert.equal(unrelated.reason, 'no-action-chain');
      assert.equal(isInteractiveCardActionChainBan('ZZZ-unrelated'), false);
      assert.equal(
        isInteractiveCardActionChainBan('A'),
        true,
        'the action chain itself must be unaffected',
      );

      // The unrelated result must not hijack the chain: completing the action
      // with no matching result still releases explicitly.
      const effect = requested.effects.find(
        (e) => e.type === 'SUBMIT_CARD_ACTION',
      );
      assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');
      const outcome = await executeSubmitIncomingOverboardEffect(
        store,
        effect,
        async () => ({ ok: true, result: null }),
        'tok',
        EMPTY_RUNTIME_LEGACY_SINKS,
      );
      assert.equal(outcome.materializedResultBanId, null);
      assert.equal(
        store.getState().items.queue.some((i) => i.kind === 'result'),
        false,
      );
    },
  );

  await spec(
    'B7: after the result is dismissed → advance to next queued head, else explicit Lobby',
    async () => {
      const withNext = createNotificationRuntimeStore();
      ingest(withNext, [incoming('A'), incoming('B')]);
      await submitOverboard(withNext, 'A', { wsBeforeHttpResolves: true });
      assert.equal(withNext.getState().display.kind, 'result');

      withNext.dispatch({
        type: 'CARD_DISMISS_REQUESTED',
        transitionId: 'dismiss-result-A',
        targetItemId: 'result:A',
        reason: 'close_result',
        source: 'user',
      });
      const next = withNext.getState();
      assert.equal(notificationItemId(next.items.queue[0]!), 'incoming:B');
      assert.equal(next.display.kind, 'incoming');
      assert.equal(selectOverlayVisible(next), true);

      resetInteractiveCardActionResultHandoffForTest();

      const last = createNotificationRuntimeStore();
      ingest(last, [incoming('A')]);
      await submitOverboard(last, 'A', { wsBeforeHttpResolves: true });
      assert.equal(last.getState().display.kind, 'result');
      last.dispatch({
        type: 'CARD_DISMISS_REQUESTED',
        transitionId: 'dismiss-result-A-last',
        targetItemId: 'result:A',
        reason: 'close_result',
        source: 'user',
      });
      const lobby = last.getState();
      assert.equal(lobby.items.queue.length, 0);
      assert.equal(lobby.display.kind, null);
      assert.equal(selectLobbyMayShow(lobby), true);
    },
  );

  await spec(
    'ATOMIC: presentation never passes through idle/empty between incoming and result',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      const seen: Array<{ lifecycle: string; displayKind: string | null; queueLen: number }> =
        [];
      const unsubscribe = store.subscribe(() => {
        const s = store.getState();
        seen.push({
          lifecycle: s.lifecycle.status,
          displayKind: s.display.kind,
          queueLen: s.items.queue.length,
        });
      });
      await submitOverboard(store, 'A', { wsBeforeHttpResolves: true });
      unsubscribe();

      for (const frame of seen) {
        assert.equal(
          frame.lifecycle === 'idle' &&
            frame.displayKind == null &&
            frame.queueLen === 0,
          false,
          `intermediate idle/empty frame observed: ${JSON.stringify(frame)}`,
        );
      }
      const kinds = seen.map((f) => f.displayKind);
      assert.ok(
        kinds.includes('result'),
        'the result must become the runtime display',
      );
      assert.equal(
        kinds.filter((k) => k == null).length,
        0,
        'display must never go null during the handoff',
      );
    },
  );

  await spec(
    'wiring: WS/HTTP classification and the atomic replacement are in place',
    () => {
      assert.match(
        providersSrc,
        /stageMatchingActionResult\(\{/,
        'Providers must correlate results against the action chain',
      );
      assert.match(
        providersSrc,
        /action-matching-result-\$\{staged\.outcome\}/,
        'receiveResult must short-circuit correlated results before normal-mode handling',
      );
      assert.match(
        providersSrc,
        /if \(res\.materializedResultBanId\) \{/,
        'host must not neutralize a runtime-owned overboard result',
      );
      assert.match(
        actionSrc,
        /replacement: \{ kind: 'result', result: matching\.result \}/,
        'completion must use the atomic head replacement',
      );
      assert.match(
        actionSrc,
        /abandonInteractiveCardActionChain\(\{/,
        'failure paths must abandon the chain',
      );
      assert.doesNotMatch(
        handoffSrc,
        /store\.dispatch|showHead|removeFromQueue/,
        'the correlation registry must not dispatch or mutate the queue',
      );
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `action-matching-result-handoff: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.error(`FAILED: ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
