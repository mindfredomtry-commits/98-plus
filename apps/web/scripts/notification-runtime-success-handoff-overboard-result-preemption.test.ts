/**
 * SUCCESS handoff — pending overboard RESULT must not preempt the first card.
 *
 * After the user sends a ban and exits SUCCESS, `/bans/result/pending` (or a
 * result deferred while the SUCCESS card was mounted) must not become the first
 * visible head. Actionable incoming/check heads still show; normal (non-SUCCESS)
 * result presentation is unchanged.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-success-handoff-overboard-result-preemption.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  executeSuccessHandoffMaterialize,
  requestSuccessHandoff,
  sortQueuedForSuccessDrain,
} from '../src/notification-runtime/notification-runtime.success-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  isOverboardResultOverlay,
  partitionSuccessHandoffMaterializeItems,
} from '../src/lib/success-handoff-result-preemption';

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

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const OLD = '2020-01-01T00:00:00.000Z';
const NEW = '2020-06-01T00:00:00.000Z';

function incoming(id: string, createdAt = OLD): QueuedOverlay {
  return { kind: 'incoming', ban: { id, createdAt } as BanInteraction };
}
function check(id: string, createdAt = OLD): QueuedOverlay {
  return { kind: 'check', ban: { id, createdAt } as BanInteraction };
}
function overboardResult(id: string, completedAt = NEW): QueuedOverlay {
  return {
    kind: 'result',
    result: { id, completedAt, outcome: 'overboard' } as BanResult,
  };
}
function plainResult(id: string, completedAt = NEW): QueuedOverlay {
  return {
    kind: 'result',
    result: { id, completedAt, outcome: 'both_no' } as BanResult,
  };
}

function headId(store: ReturnType<typeof createNotificationRuntimeStore>) {
  const head = store.getState().items.queue[0];
  return head ? notificationItemId(head) : null;
}

async function successExit(
  localItems: QueuedOverlay[],
  fetched?: QueuedOverlay[],
) {
  const store = createNotificationRuntimeStore();
  const req = requestSuccessHandoff(store, { transitionId: 'success-exit' });
  assert.equal(req.accepted, true);
  const outcome = await executeSuccessHandoffMaterialize(
    store,
    {
      transitionId: req.transitionId,
      localItems,
      ...(fetched ? { fetchPendingItems: async () => fetched } : {}),
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  return { store, outcome };
}

async function main() {
  await spec('POLICY: only overboard-outcome results are withheld', () => {
    assert.equal(isOverboardResultOverlay(overboardResult('R')), true);
    assert.equal(isOverboardResultOverlay(plainResult('R')), false);
    assert.equal(isOverboardResultOverlay(incoming('A')), false);

    const part = partitionSuccessHandoffMaterializeItems([
      overboardResult('R'),
      incoming('A'),
      check('C'),
      plainResult('S'),
    ]);
    assert.deepEqual(
      part.materialize.map((i) =>
        i.kind === 'result' ? `result:${i.result.id}` : `${i.kind}:${i.ban.id}`,
      ),
      ['incoming:A', 'check:C', 'result:S'],
    );
    assert.equal(part.withheld.length, 1);
  });

  await spec(
    'A: SUCCESS + fetched overboard result only → no result head, clean drain to Lobby',
    async () => {
      const { store, outcome } = await successExit([], [overboardResult('R')]);
      assert.equal(headId(store), null);
      assert.equal(store.getState().items.queue.length, 0);
      assert.equal(store.getState().display.kind, null);
      assert.equal(store.getState().lifecycle.status, 'idle');
      assert.equal(outcome, 'idle');
      assert.equal(selectLobbyMayShow(store.getState()), true);
      // Withheld, not consumed — pending indicator / «Твои запреты» still reach it.
      assert.equal(store.getState().consumed.itemIds.includes('result:R'), false);
    },
  );

  await spec(
    'B: SUCCESS + incoming + newer overboard result → incoming shown, result cannot preempt',
    async () => {
      const { store, outcome } = await successExit(
        [],
        [incoming('A', OLD), overboardResult('R', NEW)],
      );
      assert.equal(outcome, 'showing');
      assert.equal(headId(store), 'incoming:A');
      assert.equal(store.getState().display.kind, 'incoming');
      assert.deepEqual(
        store.getState().items.queue.map((i) => notificationItemId(i)),
        ['incoming:A'],
      );
    },
  );

  await spec(
    'C: SUCCESS + check + newer overboard result → check shown, result cannot preempt',
    async () => {
      const { store, outcome } = await successExit(
        [],
        [check('C', OLD), overboardResult('R', NEW)],
      );
      assert.equal(outcome, 'showing');
      assert.equal(headId(store), 'check:C');
      assert.equal(store.getState().display.kind, 'check');
    },
  );

  await spec(
    'D: normal non-SUCCESS result flow still displays the result head',
    () => {
      const store = createNotificationRuntimeStore();
      store.dispatch({
        type: 'ITEMS_RECEIVED',
        transitionId: 'normal-result',
        items: [
          {
            kind: 'result',
            result: { id: 'R', completedAt: NEW, outcome: 'overboard' } as BanResult,
          },
        ],
        replaceQueue: true,
        source: 'websocket',
      });
      assert.equal(headId(store), 'result:R');
      assert.equal(store.getState().display.kind, 'result');
      assert.equal(store.getState().lifecycle.status, 'showing');
      assert.equal(selectOverlayVisible(store.getState()), true);
    },
  );

  await spec(
    'D2: non-overboard result is still a valid SUCCESS-exit head',
    async () => {
      const { store, outcome } = await successExit([plainResult('S')]);
      assert.equal(outcome, 'showing');
      assert.equal(headId(store), 'result:S');
      assert.equal(store.getState().display.kind, 'result');
    },
  );

  await spec(
    'E: local overboard result deferred while SUCCESS was mounted → not first head',
    async () => {
      const { store, outcome } = await successExit([overboardResult('R')]);
      assert.equal(headId(store), null);
      assert.equal(store.getState().display.kind, null);
      assert.equal(outcome, 'idle');
      assert.equal(selectLobbyMayShow(store.getState()), true);
    },
  );

  await spec(
    'E2: local overboard result withheld, transport incoming still shows',
    async () => {
      const { store, outcome } = await successExit(
        [overboardResult('R')],
        [incoming('A')],
      );
      assert.equal(outcome, 'showing');
      assert.equal(headId(store), 'incoming:A');
    },
  );

  await spec(
    'E3: runtime-queue fallback also withholds an overboard result',
    async () => {
      const store = createNotificationRuntimeStore();
      store.dispatch({
        type: 'ITEMS_RECEIVED',
        transitionId: 'seed',
        items: [
          {
            kind: 'result',
            result: { id: 'R', completedAt: NEW, outcome: 'overboard' } as BanResult,
          },
        ],
        replaceQueue: true,
        source: 'websocket',
      });
      assert.equal(headId(store), 'result:R');

      const req = requestSuccessHandoff(store, { transitionId: 'exit-fallback' });
      assert.equal(req.accepted, true);
      const outcome = await executeSuccessHandoffMaterialize(
        store,
        { transitionId: req.transitionId, localItems: [] },
        EMPTY_RUNTIME_LEGACY_SINKS,
      );
      assert.equal(outcome, 'idle');
      assert.equal(headId(store), null);
      assert.equal(store.getState().display.kind, null);
    },
  );

  await spec(
    'F: suppressed result-only fetch settles lifecycle — no overlay with null card',
    async () => {
      const { store } = await successExit([], [overboardResult('R')]);
      const state = store.getState();
      assert.equal(state.lifecycle.status, 'idle');
      assert.equal(selectOverlayVisible(state), false);
      assert.equal(state.display.kind, null);
      assert.equal(state.display.payload, null);
      assert.equal(state.items.queue.length, 0);
    },
  );

  await spec('ORDERING: sortQueuedForSuccessDrain semantics unchanged', () => {
    const t = NEW;
    const sorted = sortQueuedForSuccessDrain([
      incoming('i', t),
      check('c', t),
      plainResult('r', t),
    ]);
    assert.deepEqual(
      sorted.map((x) =>
        x.kind === 'result' ? `result:${x.result.id}` : `${x.kind}:${x.ban.id}`,
      ),
      ['result:r', 'check:c', 'incoming:i'],
    );
  });

  await spec('SOURCE: policy is scoped to SUCCESS handoff materialization', () => {
    const handoff = readSource(
      'apps/web/src/notification-runtime/notification-runtime.success-handoff.ts',
    );
    assert.match(handoff, /partitionSuccessHandoffMaterializeItems/);
    assert.match(handoff, /resolveSuccessDrainBatch\(store, args\.localItems, 'local'\)/);
    assert.match(handoff, /resolveSuccessDrainBatch\(store, fetched, 'transport'\)/);
    assert.match(handoff, /'runtime-queue',/);
    // No timeouts introduced in the handoff path.
    assert.equal(handoff.includes('setTimeout'), false);

    // Normal result presentation is untouched by the policy module.
    const providers = readSource('apps/web/src/components/Providers.tsx');
    assert.equal(
      providers.includes('partitionSuccessHandoffMaterializeItems'),
      false,
    );
    assert.equal(providers.includes('isOverboardResultOverlay'), false);

    // Reducer showHead semantics unchanged (still shows queue[0]).
    const reducer = readSource(
      'apps/web/src/notification-runtime/notification-runtime.reducer.ts',
    );
    assert.equal(reducer.includes('overboard-result-preemption'), false);
    assert.match(reducer, /const head = state\.items\.queue\[0\]/);

    // V4 CTA restore untouched.
    const flow = readSource(
      'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
    );
    assert.match(flow, /post-notification-presentation-released/);
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
