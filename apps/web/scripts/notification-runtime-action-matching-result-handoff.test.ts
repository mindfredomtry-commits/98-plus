/**
 * FIX B — matching overboard result action handoff.
 *
 * Required transition:
 *   incoming → submitting → matching result replaces head → result card
 * Never: consume → idle → Lobby orb/logo → late result lost.
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
  beginInteractiveCardActionChain,
  getEarlyParkedActionResultForTest,
  getInteractiveCardActionChain,
  isInteractiveCardActionChainBan,
  resetInteractiveCardActionResultHandoffForTest,
  setActionResultWaitTimeoutMsForTest,
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
function arriveWsResult(
  store: Store,
  banId: string,
  opts: { allowEarlyPark?: boolean } = {},
) {
  return stageMatchingActionResult({
    banId,
    result: result(banId),
    source: 'ws',
    runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
    allowEarlyPark: opts.allowEarlyPark,
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
    explicitNoResult?: boolean;
    wsBeforeHttpResolves?: boolean;
    /** Schedule WS this many ms after the HTTP transport resolves (late WS). */
    wsAfterHttpMs?: number;
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
        if (opts.wsAfterHttpMs != null) {
          const delay = opts.wsAfterHttpMs;
          // Fire-and-forget late WS after HTTP body is returned to the executor.
          setTimeout(() => arriveWsResult(store, banId), delay);
        }
        return opts.httpOk === false
          ? { ok: false, error: 'API_FAIL' }
          : {
              ok: true,
              result: opts.httpResult ?? null,
              explicitNoResult: opts.explicitNoResult,
            };
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

function assertNoLobbyFrame(state: NotificationRuntimeState, label: string) {
  assert.equal(
    selectLobbyMayShow(state),
    false,
    `${label}: Lobby must not own presentation`,
  );
  assertNeverIdleEmpty(state, label);
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
const flowSrc = readFileSync(
  join(ROOT, 'src/components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);

async function main() {
  console.log('\n=== FIX B — MATCHING OVERBOARD RESULT ACTION HANDOFF ===\n');

  await spec(
    'B1: WS before HTTP → staged and atomically replaces incoming',
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
      assert.ok(s.consumed.itemIds.includes('incoming:A'));

      const chain = getInteractiveCardActionChain('A');
      assert.equal(chain?.status, 'materialized');
      assert.equal(chain?.stagedResult, null, 'staged result handed over once');
    },
  );

  await spec(
    'B2: HTTP before WS with inline result → replacement immediate; WS duplicate deduped',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const { outcome } = await submitOverboard(store, 'A', {
        httpResult: result('A'),
      });
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(outcome.matchingResultSource, 'http');
      assert.equal(store.getState().items.queue.length, 1);

      const late = arriveWsResult(store, 'A');
      assert.equal(late.outcome, 'deduped');
      assert.equal(late.reason, 'already-materialized');
      assert.equal(store.getState().items.queue.length, 1);
      assert.equal(store.getState().display.kind, 'result');
    },
  );

  await spec(
    'B3: WS arrives immediately before action transaction registration → early park claimed',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      // WS races ahead of beginInteractiveCardActionChain.
      const parked = arriveWsResult(store, 'A', { allowEarlyPark: true });
      assert.equal(parked.outcome, 'parked');
      assert.ok(getEarlyParkedActionResultForTest('A'));

      const claimed = beginInteractiveCardActionChain({
        banId: 'A',
        actionTransactionId: 'cmd-early-A',
        action: 'incoming_overboard',
        runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
      });
      assert.ok(claimed);
      assert.equal(claimed.stagedSource, 'ws');
      assert.equal(
        (claimed.stagedResult?.id ?? '').toLowerCase(),
        'a',
        'claimed staged result must match parked ban',
      );
      assert.equal(getEarlyParkedActionResultForTest('A'), null);

      // Full path: park → request (claims) → HTTP ok without body → materialize.
      resetInteractiveCardActionResultHandoffForTest();
      const store2 = createNotificationRuntimeStore();
      ingest(store2, [incoming('A')]);
      arriveWsResult(store2, 'A', { allowEarlyPark: true });
      const { outcome } = await submitOverboard(store2, 'A');
      assert.equal(outcome.ok, true);
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(outcome.matchingResultSource, 'ws');
      assert.equal(store2.getState().display.kind, 'result');
    },
  );

  await spec(
    'B4: HTTP succeeds without inline result, WS arrives later → no Lobby frame; WS replaces',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);

      const seen: Array<{
        lifecycle: string;
        displayKind: string | null;
        queueLen: number;
        action: string;
      }> = [];
      const unsubscribe = store.subscribe(() => {
        const s = store.getState();
        seen.push({
          lifecycle: s.lifecycle.status,
          displayKind: s.display.kind,
          queueLen: s.items.queue.length,
          action: s.action.status,
        });
        assertNoLobbyFrame(s, 'B4-frame');
      });

      const { stateWhileSubmitting, outcome } = await submitOverboard(
        store,
        'A',
        { wsAfterHttpMs: 40 },
      );
      unsubscribe();

      assert.equal(stateWhileSubmitting.action.status, 'pending');
      assert.equal(outcome.ok, true);
      assert.equal(outcome.materializedResultBanId, 'A');
      assert.equal(outcome.matchingResultSource, 'ws');

      const s = store.getState();
      assert.equal(s.display.kind, 'result');
      assert.equal(notificationItemId(s.items.queue[0]!), 'result:A');
      assert.equal(selectLobbyMayShow(s), false);

      for (const frame of seen) {
        assert.equal(
          frame.lifecycle === 'idle' &&
            frame.displayKind == null &&
            frame.queueLen === 0,
          false,
          `idle/empty frame during B4: ${JSON.stringify(frame)}`,
        );
        assert.notEqual(frame.displayKind, null, 'display must stay non-null');
      }
    },
  );

  await spec('B5: Duplicate HTTP + WS → one result card only', async () => {
    const store = createNotificationRuntimeStore();
    ingest(store, [incoming('A')]);

    const { outcome } = await submitOverboard(store, 'A', {
      wsBeforeHttpResolves: true,
      httpResult: result('A'),
    });
    assert.equal(outcome.materializedResultBanId, 'A');
    assert.equal(outcome.matchingResultSource, 'ws');

    const s = store.getState();
    assert.equal(s.items.queue.length, 1);
    assert.equal(
      s.items.queue.filter((i) => i.kind === 'result').length,
      1,
    );
  });

  await spec(
    'B6: Unrelated WS result → not attached to active action',
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
        allowEarlyPark: false,
      });
      assert.equal(unrelated.outcome, 'not-correlated');
      assert.equal(isInteractiveCardActionChainBan('ZZZ-unrelated'), false);
      assert.equal(isInteractiveCardActionChainBan('A'), true);

      // Complete via explicit no-result so the unrelated result cannot hijack.
      const effect = requested.effects.find(
        (e) => e.type === 'SUBMIT_CARD_ACTION',
      );
      assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');
      const outcome = await executeSubmitIncomingOverboardEffect(
        store,
        effect,
        async () => ({ ok: true, result: null, explicitNoResult: true }),
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
    'B7: Explicit no-result contract → advance to next item or complete Lobby',
    async () => {
      const advance = createNotificationRuntimeStore();
      ingest(advance, [incoming('A'), incoming('B')]);
      const advanced = await submitOverboard(advance, 'A', {
        explicitNoResult: true,
      });
      assert.equal(advanced.outcome.ok, true);
      assert.equal(advanced.outcome.materializedResultBanId, null);
      const advancedState = advance.getState();
      assert.equal(
        notificationItemId(advancedState.items.queue[0]!),
        'incoming:B',
      );
      assert.equal(advancedState.display.kind, 'incoming');

      resetInteractiveCardActionResultHandoffForTest();

      const toLobby = createNotificationRuntimeStore();
      ingest(toLobby, [incoming('A')]);
      const released = await submitOverboard(toLobby, 'A', {
        explicitNoResult: true,
      });
      assert.equal(released.outcome.materializedResultBanId, null);
      const lobbyState = toLobby.getState();
      assert.equal(lobbyState.items.queue.length, 0);
      assert.equal(lobbyState.display.kind, null);
      assert.equal(selectLobbyMayShow(lobbyState), true);

      const chain = getInteractiveCardActionChain('A');
      assert.equal(chain?.status, 'released-without-result');
      assert.equal(isInteractiveCardActionChainBan('A'), false);
    },
  );

  await spec(
    'B8: Expected-result timeout → no silent idle / no orb-logo Lobby; recoverable failure',
    async () => {
      setActionResultWaitTimeoutMsForTest(80);
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B')]);

      const seen: Array<{
        lifecycle: string;
        displayKind: string | null;
        queueLen: number;
      }> = [];
      const unsubscribe = store.subscribe(() => {
        const s = store.getState();
        seen.push({
          lifecycle: s.lifecycle.status,
          displayKind: s.display.kind,
          queueLen: s.items.queue.length,
        });
      });

      const { outcome } = await submitOverboard(store, 'A');
      unsubscribe();

      assert.equal(outcome.ok, false);
      assert.equal(outcome.error, 'ACTION_RESULT_WAIT_TIMEOUT');

      const s = store.getState();
      assert.equal(s.lifecycle.status, 'showing');
      assert.equal(s.action.status, 'failed');
      assert.equal(s.action.errorCode, 'ACTION_RESULT_WAIT_TIMEOUT');
      assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:A');
      assert.equal(s.display.kind, 'incoming');
      assert.equal(selectOverlayVisible(s), true);
      assert.equal(selectLobbyMayShow(s), false);
      assertNeverIdleEmpty(s, 'B8');

      for (const frame of seen) {
        assert.equal(
          frame.lifecycle === 'idle' &&
            frame.displayKind == null &&
            frame.queueLen === 0,
          false,
          `B8 must not idle/empty: ${JSON.stringify(frame)}`,
        );
      }
    },
  );

  await spec(
    'B9: HTTP failure → incoming remains recoverable',
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
      assert.equal(s.items.queue.length, 2);
      assert.equal(s.display.kind, 'incoming');
      assert.equal(
        s.items.queue.some((i) => i.kind === 'result'),
        false,
      );
      assertNeverIdleEmpty(s, 'B9');
      assert.equal(getInteractiveCardActionChain('A'), null);
    },
  );

  await spec(
    'B10: Result dismissal → advances exactly once to next card or complete Lobby',
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
    'B11: Runtime display sequence incoming → submitting incoming → result (no null/idle/Lobby)',
    async () => {
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      const seen: Array<{
        lifecycle: string;
        displayKind: string | null;
        queueLen: number;
        action: string;
      }> = [];
      const unsubscribe = store.subscribe(() => {
        const s = store.getState();
        seen.push({
          lifecycle: s.lifecycle.status,
          displayKind: s.display.kind,
          queueLen: s.items.queue.length,
          action: s.action.status,
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
          `intermediate idle/empty: ${JSON.stringify(frame)}`,
        );
        assert.notEqual(
          frame.displayKind,
          null,
          `display must never go null: ${JSON.stringify(frame)}`,
        );
      }
      const kinds = seen.map((f) => f.displayKind);
      assert.ok(kinds.includes('result'));
      assert.ok(
        seen.some(
          (f) =>
            f.lifecycle === 'submitting' &&
            f.displayKind === 'incoming' &&
            f.action === 'pending',
        ),
        'must observe submitting incoming',
      );
      assert.equal(store.getState().display.kind, 'result');
    },
  );

  await spec(
    'B12: Single-owner invariant — no direct Providers write to active display / owner queue',
    () => {
      assert.match(
        providersSrc,
        /stageMatchingActionResult\(\{/,
        'Providers must correlate results against the action chain',
      );
      assert.match(
        providersSrc,
        /allowEarlyPark/,
        'Providers must early-park WS-before-chain for the active incoming',
      );
      assert.match(
        providersSrc,
        /action-matching-result-\$\{staged\.outcome\}/,
        'receiveResult must short-circuit correlated results before normal-mode',
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
        /waitForMatchingActionResult/,
        'must wait for expected matching WS result',
      );
      assert.match(
        actionSrc,
        /explicitNoResult/,
        'consume-and-advance only on explicit no-result contract',
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
      assert.match(
        flowSrc,
        /notificationTransitionOwnsPresentation/,
        'InstantBanFlow must derive presentation only',
      );
      assert.doesNotMatch(
        flowSrc,
        /CARD_ACTION_SUCCEEDED|consumeAndAdvance:\s*true/,
        'InstantBanFlow must not write action completion',
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
