/**
 * Integration-style Providers queue flow test (no UI).
 *
 * Run: npx tsx apps/web/scripts/providers-queue-flow.test.ts
 *
 * Prints per-step snapshots on the action where activeHead first becomes null.
 */

import assert from 'node:assert/strict';
import {
  actionCheckFirstAnswerTraced,
  actionResultGoToBansTraced,
  assertHeadAliveWhileWorkRemains,
  createFlowState,
  formatSnapshot,
  hasRemainingWork,
  startLobbyBansNotificationDrain,
  type QueueItem,
  type TracedActionResult,
} from './providers-queue-flow';

type CaseResult = { name: string; ok: boolean; detail: string };

function runCase(name: string, fn: () => void): CaseResult {
  try {
    fn();
    return { name, ok: true, detail: 'ok' };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { name, ok: false, detail };
  }
}

function printTrace(
  actionLabel: string,
  traced: TracedActionResult,
): void {
  process.stdout.write(`\n=== TRACE ${actionLabel} ===\n`);
  for (const snap of traced.snapshots) {
    process.stdout.write(`${formatSnapshot(snap)}\n`);
  }
  if (traced.activeHeadBecameNullAt) {
    process.stdout.write(
      `\nACTIVE_HEAD_FIRST_NULL:\n` +
        `  step=${traced.activeHeadBecameNullAt.step} (${traced.activeHeadBecameNullAt.stepName})\n` +
        `  function=${traced.activeHeadClearedBy}\n` +
        `  activeHead=${traced.activeHeadBecameNullAt.activeHead ?? 'null'}\n` +
        `  displayHead=${traced.activeHeadBecameNullAt.displayHead ?? 'null'}\n` +
        `  overlayLen=${traced.activeHeadBecameNullAt.overlayLen}\n` +
        `  pendingLen=${traced.activeHeadBecameNullAt.pendingLen}\n` +
        `  ownerLen=${traced.activeHeadBecameNullAt.ownerLen}\n`,
    );
  } else {
    process.stdout.write(`\nACTIVE_HEAD_FIRST_NULL: (did not become null this action)\n`);
  }
}

const cards: QueueItem[] = [
  { kind: 'check', banId: 'c1' },
  { kind: 'result', banId: 'r2' },
  { kind: 'check', banId: 'c3' },
  { kind: 'result', banId: 'r4' },
  { kind: 'check', banId: 'c5' },
];

function testSequentialActionsHeadStaysAlive(): void {
  const state = createFlowState();
  startLobbyBansNotificationDrain(state, cards);
  state.overlayQueue = [cards[0]!, cards[1]!, cards[2]!, cards[3]!];
  state.ownerQueue = [...state.overlayQueue];
  state.pending = [cards[4]!];
  state.active = cards[0]!;
  state.displayHead = cards[0]!;

  assert.equal(state.active?.banId, 'c1');
  assert.equal(state.pending.length, 1);

  for (let step = 0; step < 5; step += 1) {
    assertHeadAliveWhileWorkRemains(state, `before-action-${step}`);
    if (!hasRemainingWork(state)) break;

    const head = state.active;
    assert.ok(head, `before-action-${step}: expected active head`);

    const traced =
      head.kind === 'check'
        ? actionCheckFirstAnswerTraced(state, head.banId)
        : actionResultGoToBansTraced(state, head.banId);

    if (traced.activeHeadBecameNullAt) {
      printTrace(
        `action-${step}(${head.kind}:${head.banId})`,
        traced,
      );
    }

    assertHeadAliveWhileWorkRemains(
      state,
      `after-action-${step}(${head.kind}:${head.banId})`,
    );
  }
}

function testBreakAfterTwoToThreeCardsWithOverlayPrefix(): void {
  const state = createFlowState();
  state.overlayQueue = [
    { kind: 'check', banId: 'c1' },
    { kind: 'result', banId: 'r2' },
    { kind: 'check', banId: 'c3' },
    { kind: 'result', banId: 'r4' },
  ];
  state.ownerQueue = [...state.overlayQueue];
  state.pending = [{ kind: 'check', banId: 'c5' }];
  state.active = state.overlayQueue[0]!;
  state.displayHead = state.overlayQueue[0]!;
  state.awaitingUser = true;
  state.chainAdvanceExplicit = true;

  const traced1 = actionCheckFirstAnswerTraced(state, 'c1');
  if (traced1.activeHeadBecameNullAt) {
    printTrace('action-0(check:c1)', traced1);
  }
  assertHeadAliveWhileWorkRemains(state, 'after-1-check-c1');

  const head2 = state.active;
  assert.ok(head2, 'after-1: expected head');
  const traced2 =
    head2.kind === 'check'
      ? actionCheckFirstAnswerTraced(state, head2.banId)
      : actionResultGoToBansTraced(state, head2.banId);
  printTrace(`action-1(${head2.kind}:${head2.banId})`, traced2);
  assertHeadAliveWhileWorkRemains(state, 'after-2');
}

const results: CaseResult[] = [
  runCase(
    'sequential check/result after lobby drain — head alive while work remains',
    testSequentialActionsHeadStaysAlive,
  ),
  runCase(
    'overlay prefix + pending — head alive through actions 2–3',
    testBreakAfterTwoToThreeCardsWithOverlayPrefix,
  ),
];

let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`[${mark}] ${r.name}\n`);
  if (!r.ok) {
    failed += 1;
    process.stdout.write(`       ${r.detail}\n`);
  }
}

if (failed > 0) {
  process.stdout.write(
    `\n${failed}/${results.length} failed.\n`,
  );
  process.exit(1);
}

process.stdout.write(`\n${results.length}/${results.length} passed.\n`);
process.exit(0);
