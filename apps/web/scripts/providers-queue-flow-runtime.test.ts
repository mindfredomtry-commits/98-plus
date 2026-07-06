/**
 * Runtime-faithful Providers queue flow test (no UI, no pop model).
 *
 * Run: npx tsx apps/web/scripts/providers-queue-flow-runtime.test.ts
 *
 * Models real path:
 * dismiss → applyOverlayQueue(remaining) → continue → showNextNotificationFromChainSync
 * (read head via resolveShowNextHeadDecision, display same head, no slice/pop).
 *
 * If this suite PASSES, the runtime break is not explained by showNext pop-advance
 * (old providers-queue-flow.test.ts is an incorrect model — do not use for fixes).
 */

import assert from 'node:assert/strict';
import {
  actionCheckFirstAnswerRuntimeTraced,
  actionResultGoToBansRuntimeTraced,
  assertHeadAliveWhileWorkRemains,
  createRuntimeFlowState,
  formatSnapshot,
  hasRemainingWork,
  type QueueItem,
  type TracedActionResult,
} from './providers-queue-flow-runtime';

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

function printTrace(actionLabel: string, traced: TracedActionResult): void {
  process.stdout.write(`\n=== RUNTIME TRACE ${actionLabel} ===\n`);
  for (const snap of traced.snapshots) {
    process.stdout.write(`${formatSnapshot(snap)}\n`);
  }
  if (traced.activeHeadBecameNullAt) {
    process.stdout.write(
      `\nACTIVE_HEAD_FIRST_NULL:\n` +
        `  step=${traced.activeHeadBecameNullAt.step} (${traced.activeHeadBecameNullAt.stepName})\n` +
        `  function=${traced.activeHeadClearedBy}\n` +
        `  overlayLen=${traced.activeHeadBecameNullAt.overlayLen}\n` +
        `  pendingLen=${traced.activeHeadBecameNullAt.pendingLen}\n` +
        `  ownerLen=${traced.activeHeadBecameNullAt.ownerLen}\n`,
    );
  }
}

function assertShowNextNoPop(traced: TracedActionResult, label: string): void {
  const applySnap = traced.snapshots.find((s) => s.step === 2);
  const showSnap = traced.snapshots.find((s) => s.step === 3);
  assert.ok(applySnap && showSnap, `${label}: missing step snapshots`);
  // showNext may promote pending into overlay (len can grow), must not shrink.
  assert.ok(
    showSnap.overlayLen >= applySnap.overlayLen ||
      (applySnap.overlayLen === 0 && showSnap.overlayLen >= 0),
    `${label}: showNext must not pop head (overlayLen ${applySnap.overlayLen} → ${showSnap.overlayLen})`,
  );
  if (applySnap.activeHead != null && showSnap.activeHead == null) {
    // Only fail invariant if work remains
  }
}

const cards: QueueItem[] = [
  { kind: 'check', banId: 'c1' },
  { kind: 'result', banId: 'r2' },
  { kind: 'check', banId: 'c3' },
  { kind: 'result', banId: 'r4' },
  { kind: 'check', banId: 'c5' },
];

/** Same shape that incorrectly failed under pop-model. */
function testSequentialActionsNoPopShowNext(): void {
  const state = createRuntimeFlowState();
  state.overlayQueue = [cards[0]!, cards[1]!, cards[2]!, cards[3]!];
  state.ownerQueue = [...state.overlayQueue];
  state.pending = [cards[4]!];
  state.active = cards[0]!;
  state.displayHead = cards[0]!;
  state.awaitingUser = true;
  state.chainAdvanceExplicit = true;

  for (let step = 0; step < 5; step += 1) {
    assertHeadAliveWhileWorkRemains(state, `before-action-${step}`);
    if (!hasRemainingWork(state)) break;

    const head = state.active;
    assert.ok(head, `before-action-${step}: expected active head`);

    const traced =
      head.kind === 'check'
        ? actionCheckFirstAnswerRuntimeTraced(state, head.banId)
        : actionResultGoToBansRuntimeTraced(state, head.banId);

    assertShowNextNoPop(traced, `action-${step}`);

    if (traced.activeHeadBecameNullAt) {
      printTrace(`action-${step}(${head.kind}:${head.banId})`, traced);
    }

    assertHeadAliveWhileWorkRemains(
      state,
      `after-action-${step}(${head.kind}:${head.banId})`,
    );
  }
}

function testOverlayPrefixPlusPendingNoPop(): void {
  const state = createRuntimeFlowState();
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

  const traced1 = actionCheckFirstAnswerRuntimeTraced(state, 'c1');
  assertShowNextNoPop(traced1, 'action-0');
  assertHeadAliveWhileWorkRemains(state, 'after-1-check-c1');

  const head2 = state.active;
  assert.ok(head2, 'after-1: expected head');
  const traced2 =
    head2.kind === 'check'
      ? actionCheckFirstAnswerRuntimeTraced(state, head2.banId)
      : actionResultGoToBansRuntimeTraced(state, head2.banId);
  assertShowNextNoPop(traced2, 'action-1');
  if (traced2.activeHeadBecameNullAt) {
    printTrace(`action-1(${head2.kind}:${head2.banId})`, traced2);
  }
  assertHeadAliveWhileWorkRemains(state, 'after-2');

  if (hasRemainingWork(state)) {
    const head3 = state.active;
    assert.ok(head3, 'after-2: expected head before action 3');
    const traced3 =
      head3.kind === 'check'
        ? actionCheckFirstAnswerRuntimeTraced(state, head3.banId)
        : actionResultGoToBansRuntimeTraced(state, head3.banId);
    assertShowNextNoPop(traced3, 'action-2');
    if (traced3.activeHeadBecameNullAt) {
      printTrace(`action-2(${head3.kind}:${head3.banId})`, traced3);
    }
    assertHeadAliveWhileWorkRemains(state, 'after-3');
  }
}

/** Head-only overlay + pending-only remainder (lobby drain shape). */
function testLobbyDrainHeadOnlyThenChain(): void {
  const state = createRuntimeFlowState();
  state.overlayQueue = [cards[0]!];
  state.ownerQueue = [cards[0]!];
  state.pending = cards.slice(1);
  state.active = cards[0]!;
  state.displayHead = cards[0]!;
  state.awaitingUser = true;
  state.chainAdvanceExplicit = true;

  for (let step = 0; step < 5; step += 1) {
    assertHeadAliveWhileWorkRemains(state, `drain-before-${step}`);
    if (!hasRemainingWork(state)) break;
    const head = state.active;
    assert.ok(head, `drain-before-${step}: expected head`);
    const traced =
      head.kind === 'check'
        ? actionCheckFirstAnswerRuntimeTraced(state, head.banId)
        : actionResultGoToBansRuntimeTraced(state, head.banId);
    assertShowNextNoPop(traced, `drain-action-${step}`);
    if (traced.activeHeadBecameNullAt) {
      printTrace(`drain-action-${step}(${head.kind}:${head.banId})`, traced);
    }
    assertHeadAliveWhileWorkRemains(state, `drain-after-${step}`);
  }
}

const results: CaseResult[] = [
  runCase(
    'runtime model: sequential actions, showNext does not pop',
    testSequentialActionsNoPopShowNext,
  ),
  runCase(
    'runtime model: overlay prefix + pending through actions 2–3',
    testOverlayPrefixPlusPendingNoPop,
  ),
  runCase(
    'runtime model: lobby drain head-only + pending chain',
    testLobbyDrainHeadOnlyThenChain,
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
    `\n${failed}/${results.length} failed — runtime-faithful path reproduces head=null.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `\n${results.length}/${results.length} passed — dismiss→apply→showNext (no pop) does not reproduce the break.\n` +
    `Cause is likely another guard/return in real Providers, not showNextNotificationFromChainSync pop-advance.\n` +
    `Do not use providers-queue-flow.test.ts (pop model) for fixes.\n`,
);
process.exit(0);
