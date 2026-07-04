/**
 * Queue consume transition contract (no UI).
 *
 * Run: npx tsx apps/web/scripts/queue-consume-transition.test.ts
 *
 * Expected (all PASS after promotePendingIfOverlayEmpty):
 * 1. incoming consume → next stays overlay head
 * 2. check first-answer → pending promoted to head
 * 3. standalone result go-to-bans → pending promoted to head
 */

import assert from 'node:assert/strict';
import {
  consumeCheckFirstAnswer,
  consumeIncoming,
  consumeResultGoToBans,
  queueHeadBanId,
  type NotificationQueueState,
  type QueuedOverlay,
} from './queue-consume-transition';

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

const incomingA: QueuedOverlay = { kind: 'incoming', banId: 'ban-incoming-a' };
const checkB: QueuedOverlay = { kind: 'check', banId: 'ban-check-b' };
const checkA: QueuedOverlay = { kind: 'check', banId: 'ban-check-a' };
const resultA: QueuedOverlay = { kind: 'result', banId: 'ban-result-a' };
const nextCard: QueuedOverlay = { kind: 'incoming', banId: 'ban-next' };

/** 1. incoming consume → next remains head (next already in overlay). */
function testIncomingConsumeNextStaysHead(): void {
  const before: NotificationQueueState = {
    overlayQueue: [incomingA, checkB],
    pending: [],
  };
  const after = consumeIncoming(before, incomingA.banId);
  assert.equal(
    queueHeadBanId(after),
    checkB.banId,
    `expected head=${checkB.banId}, got ${queueHeadBanId(after)}`,
  );
  assert.equal(after.overlayQueue.length, 1);
  assert.equal(after.pending.length, 0);
}

/** 2. check first-answer: next only in pending must become overlay head. */
function testCheckFirstAnswerPendingBecomesHead(): void {
  const before: NotificationQueueState = {
    overlayQueue: [checkA],
    pending: [nextCard],
  };
  const after = consumeCheckFirstAnswer(before, checkA.banId);
  assert.equal(
    queueHeadBanId(after),
    nextCard.banId,
    `expected head=${nextCard.banId} (promoted from pending), got ${queueHeadBanId(after)}; pendingLen=${after.pending.length} overlayLen=${after.overlayQueue.length}`,
  );
}

/** 3. standalone result go-to-bans: next only in pending must become overlay head. */
function testResultGoToBansPendingBecomesHead(): void {
  const before: NotificationQueueState = {
    overlayQueue: [resultA],
    pending: [nextCard],
  };
  const after = consumeResultGoToBans(before, resultA.banId);
  assert.equal(
    queueHeadBanId(after),
    nextCard.banId,
    `expected head=${nextCard.banId} (promoted from pending), got ${queueHeadBanId(after)}; pendingLen=${after.pending.length} overlayLen=${after.overlayQueue.length}`,
  );
}

const results: CaseResult[] = [
  runCase(
    '1. incoming consume → next remains head',
    testIncomingConsumeNextStaysHead,
  ),
  runCase(
    '2. check first-answer → next/pending becomes head',
    testCheckFirstAnswerPendingBecomesHead,
  ),
  runCase(
    '3. standalone result go-to-bans → next becomes head',
    testResultGoToBansPendingBecomesHead,
  ),
];

let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  // Script output only (not app debug overlay).
  console.log(`[${mark}] ${r.name}`);
  if (!r.ok) {
    failed += 1;
    console.log(`       ${r.detail}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed}/${results.length} failed.`);
  process.exit(1);
}

console.log(`\n${results.length}/${results.length} passed.`);
process.exit(0);
