/**
 * Vertical V3 — Lobby CTA / chrome release after the final runtime overboard.
 *
 * Production after V2: runtime reached idle+empty, but InstantBanFlow ctaState
 * stayed 'hidden' from SUCCESS exit and stale host pins kept dim/mount, so the
 * Lobby appeared without the «запрещать» CTA.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-overboard-cta-release.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  executeSubmitIncomingOverboardEffect,
  requestIncomingOverboardAction,
} from '../src/notification-runtime/notification-runtime.overboard-action';
import {
  getIncomingOverboardCompletionSnapshot,
  isFinalIncomingOverboardCompletion,
  isRuntimeIdleEmptyAfterOverboard,
  noteIncomingOverboardCompletion,
  resetIncomingOverboardCompletionForTest,
  subscribeIncomingOverboardCompletion,
} from '../src/notification-runtime/notification-runtime.overboard-completion';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { selectNotificationRuntimeUiSnapshot } from '../src/notification-runtime/notification-runtime.snapshot';
import { selectOverlayVisible } from '../src/notification-runtime/notification-runtime.selectors';
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
          // that is the consume-and-advance path these CTA release specs cover.
          // Matching-result materialization is covered by the Fix B suite.
          { ok: true, result: null }
        : { ok: false, error: 'API_FAIL' },
    'tok',
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

async function main() {
  console.log('\n=== V3 OVERBOARD LOBBY CTA RELEASE ===\n');

  await spec(
    'A: one incoming card — overboard success emits completion edge on idle+empty',
    async () => {
      resetIncomingOverboardCompletionForTest();
      let notifications = 0;
      subscribeIncomingOverboardCompletion(() => {
        notifications += 1;
      });
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      const res = await overboard(store, 'A');
      assert.equal(res.ok, true);
      const state = store.getState();
      assert.equal(state.lifecycle.status, 'idle');
      assert.equal(state.display.kind, null);
      assert.equal(state.items.queue.length, 0);
      assert.equal(state.action.status, 'idle');
      assert.equal(isRuntimeIdleEmptyAfterOverboard(state), true);
      const completion = getIncomingOverboardCompletionSnapshot();
      assert.equal(completion.seq, 1, 'one completion edge');
      assert.equal(completion.targetItemId, 'incoming:A');
      assert.equal(completion.banId, 'A');
      assert.equal(notifications, 1, 'subscribers notified once');
    },
  );

  await spec(
    'A2: V4 bypasses V3 runtime-idle CTA restore; uses presentation-release edge',
    () => {
      const flow = readSource(
        'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
      );
      // V3 early CTA restore from runtime completion edge is bypassed.
      assert.equal(
        flow.includes("openLobby('overboard-runtime-complete')"),
        false,
      );
      assert.equal(flow.includes('subscribeIncomingOverboardCompletion'), false);
      // V4: CTA restores only on post-notification presentation fully released.
      assert.match(flow, /post-notification-presentation-released/);
      assert.match(flow, /isPostNotificationPresentationFullyReleased/);
      assert.match(flow, /detectPostNotificationPresentationReleaseEdge/);
      assert.match(flow, /beginCtaSpringIn\(\)/);
      assert.match(flow, /allowSuccessExitLobbyOpen\(\)/);
    },
  );

  await spec(
    'B: three incoming cards — no edge between cards, one edge on the final',
    async () => {
      resetIncomingOverboardCompletionForTest();
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B'), incoming('C')]);

      await overboard(store, 'A');
      assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:B');
      assert.equal(store.getState().lifecycle.status, 'showing');
      assert.equal(
        getIncomingOverboardCompletionSnapshot().seq,
        0,
        'no CTA release while a card is still showing',
      );

      await overboard(store, 'B');
      assert.equal(notificationItemId(store.getState().items.queue[0]!), 'incoming:C');
      assert.equal(getIncomingOverboardCompletionSnapshot().seq, 0);

      await overboard(store, 'C');
      const state = store.getState();
      assert.equal(state.lifecycle.status, 'idle');
      assert.equal(state.items.queue.length, 0);
      const completion = getIncomingOverboardCompletionSnapshot();
      assert.equal(completion.seq, 1, 'exactly one CTA release for the chain');
      assert.equal(completion.banId, 'C');
    },
  );

  await spec(
    'C: no blank dim overlay — runtime empty releases host mount/dim pins',
    async () => {
      resetIncomingOverboardCompletionForTest();
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      await overboard(store, 'A');
      const ui = selectNotificationRuntimeUiSnapshot(store.getState());
      assert.equal(ui.overlayVisible, false);
      assert.equal(ui.display.incomingBan, null);
      assert.equal(ui.display.checkBan, null);
      assert.equal(ui.display.result, null);
      assert.equal(ui.queueLength, 0);
      assert.equal(ui.lobbyMayShow, true);
      assert.equal(ui.interactiveLobbyChromeMayShow, true);

      const providers = readSource('apps/web/src/components/Providers.tsx');
      const releaseBlock = providers.match(
        /const \{ seq, banId, commandId \} = incomingOverboardCompletion;[\s\S]*?\}, \[/,
      );
      assert.ok(releaseBlock, 'providers completion release effect present');
      const block = releaseBlock![0];
      assert.match(block, /clearActiveIncomingOverlayBanStable\(source\)/);
      assert.match(
        block,
        /clearNotificationOverlayForEmptyQueueAfterSuccessExit\(source\)/,
      );
      assert.match(block, /commitVisualQueueDimSessionRelease\(source, \{/);
      // Host may only project/clear obsolete UI state.
      assert.doesNotMatch(block, /store\.dispatch|notificationRuntimeStore\.dispatch/);
      assert.doesNotMatch(block, /applyOverlayQueue|showHead|dismissHead/);
      assert.doesNotMatch(block, /setTimeout/);
    },
  );

  await spec(
    'D: API failure — no CTA release, card and overlay preserved',
    async () => {
      resetIncomingOverboardCompletionForTest();
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A'), incoming('B')]);
      const res = await overboard(store, 'A', false);
      assert.equal(res.ok, false);
      const state = store.getState();
      assert.equal(state.lifecycle.status, 'showing');
      assert.equal(notificationItemId(state.items.queue[0]!), 'incoming:A');
      assert.equal(state.items.queue.length, 2);
      assert.equal(state.action.status, 'failed');
      assert.equal(selectOverlayVisible(state), true);
      assert.equal(getIncomingOverboardCompletionSnapshot().seq, 0);
    },
  );

  await spec(
    'E: stale legacy owner/queue cannot prevent release after runtime idle+empty',
    () => {
      resetIncomingOverboardCompletionForTest();
      // The completion decision reads runtime state only — legacy queue length,
      // owner active/display and stable pins are not inputs.
      const store = createNotificationRuntimeStore();
      ingest(store, [incoming('A')]);
      const before = store.getState();
      store.dispatch({
        type: 'CARD_ACTION_REQUESTED',
        commandId: 'cmd-A',
        targetItemId: 'incoming:A',
        action: 'incoming_overboard',
        source: 'user',
      });
      const inFlight = store.getState();
      store.dispatch({
        type: 'CARD_ACTION_SUCCEEDED',
        commandId: 'cmd-A',
        targetItemId: 'incoming:A',
        consumeAndAdvance: true,
        source: 'user',
      });
      const after = store.getState();
      assert.equal(
        isFinalIncomingOverboardCompletion(inFlight, after, 'incoming:A'),
        true,
      );
      assert.equal(
        isFinalIncomingOverboardCompletion(before, after, 'incoming:A'),
        false,
        'no in-flight action → not a completion',
      );
      assert.equal(
        noteIncomingOverboardCompletion(inFlight, after, {
          commandId: 'cmd-A',
          targetItemId: 'incoming:A',
        }),
        true,
      );
      // Idempotent: replaying the same command cannot restart the CTA spring.
      assert.equal(
        noteIncomingOverboardCompletion(inFlight, after, {
          commandId: 'cmd-A',
          targetItemId: 'incoming:A',
        }),
        false,
      );
      assert.equal(getIncomingOverboardCompletionSnapshot().seq, 1);

      const providers = readSource('apps/web/src/components/Providers.tsx');
      const releaseBlock = providers.match(
        /const \{ seq, banId, commandId \} = incomingOverboardCompletion;[\s\S]*?\}, \[/,
      );
      assert.ok(releaseBlock);
      // Chain transitioning is released from the runtime edge even when the
      // legacy empty-queue helper refuses because overlayQueueRef is stale.
      assert.match(
        releaseBlock![0],
        /setNotificationChainTransitioning\(false\)/,
      );
    },
  );

  await spec(
    'F: check_answer / SUCCESS handoff paths do not emit a CTA release',
    async () => {
      resetIncomingOverboardCompletionForTest();
      const store = createNotificationRuntimeStore();
      ingest(store, [{ kind: 'check', ban: ban('X') }]);
      const before = store.getState();
      store.dispatch({
        type: 'CARD_ACTION_REQUESTED',
        commandId: 'cmd-X',
        targetItemId: 'check:X',
        action: 'check_answer',
        completed: true,
        source: 'user',
      });
      const inFlight = store.getState();
      store.dispatch({
        type: 'CARD_DISMISS_REQUESTED',
        transitionId: 'dismiss-X',
        targetItemId: 'check:X',
        reason: 'user_dismiss',
        source: 'user',
      });
      const after = store.getState();
      assert.equal(after.lifecycle.status, 'idle');
      assert.equal(
        isFinalIncomingOverboardCompletion(inFlight, after, 'incoming:X'),
        false,
        'check target id never matches an incoming overboard target',
      );
      assert.equal(getIncomingOverboardCompletionSnapshot().seq, 0);
      void before;

      // Overboard remains result-free: no runtime result head after success.
      const overboardStore = createNotificationRuntimeStore();
      ingest(overboardStore, [incoming('A')]);
      await overboard(overboardStore, 'A');
      assert.equal(overboardStore.getState().display.kind, null);
      assert.equal(
        overboardStore
          .getState()
          .items.queue.filter((item) => item.kind === 'result').length,
        0,
      );

      const providers = readSource('apps/web/src/components/Providers.tsx');
      assert.match(providers, /\[FORCE OVERBOARD\] v2-noop/);
      assert.match(
        providers,
        /replaceIncomingWithOverboardResultAtomic:v2-noop/,
      );
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
