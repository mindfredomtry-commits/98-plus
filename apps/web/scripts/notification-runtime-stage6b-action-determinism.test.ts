/**
 * Stage 6B Phase 2 — user action determinism.
 *
 * First valid tap always accepted once. Duplicate taps ignored only because
 * pending/completed/local-in-flight. No wall-clock / animation gates.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6b-action-determinism.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  allowOverlayUserTap,
  isOverlayInputLocked,
  setOverlayInputLockAfterAction,
  shouldBlockOverlayUserTap,
} from '../src/lib/overlay-input-guard';
import {
  countAcceptedCardActionTaps,
  decideCardActionTap,
} from '../src/notification-runtime/notification-runtime.card-action-tap';
import { requestIncomingOverboardAction } from '../src/notification-runtime/notification-runtime.overboard-action';
import {
  createNotificationRuntimeStore,
  syncRuntimeQueue,
  nextRuntimeTransitionId,
} from '../src/notification-runtime/notification-runtime.store';
import { selectIsActionBlocked } from '../src/notification-runtime/notification-runtime.selectors';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string): BanInteraction {
  return { id, text: 'x', sender: { id: 's1' } } as BanInteraction;
}

function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function seed(items: NotificationItem[]) {
  const store = createNotificationRuntimeStore();
  syncRuntimeQueue(store, items, 'test', nextRuntimeTransitionId('phase2-seed'));
  return store;
}

const webSrc = join(process.cwd(), 'apps/web/src');
const incomingSrc = readFileSync(
  join(webSrc, 'components/IncomingBanOverlay.tsx'),
  'utf8',
);
const resultSrc = readFileSync(
  join(webSrc, 'components/ResultOverlay.tsx'),
  'utf8',
);
const instantBanSrc = readFileSync(
  join(webSrc, 'components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);
const guardSrc = readFileSync(join(webSrc, 'lib/overlay-input-guard.ts'), 'utf8');

// —— 1. First visible tap succeeds ——
{
  const d = decideCardActionTap({
    targetPresent: true,
    controlReady: true,
    runtimeActionBlocked: false,
    localInFlight: false,
  });
  assert.equal(d.accept, true);
  pass('1. first visible tap succeeds');
}

// —— 2. Second immediate tap creates no duplicate ——
{
  let localInFlight = false;
  let submissions = 0;
  const tap = () => {
    const d = decideCardActionTap({
      controlReady: true,
      localInFlight,
    });
    if (!d.accept) return;
    localInFlight = true;
    submissions += 1;
  };
  tap();
  tap();
  assert.equal(submissions, 1);
  pass('2. second immediate tap creates no duplicate request');
}

// —— 3. Tap during animation after visible controls succeeds ——
{
  // Animation is not an input to decideCardActionTap — visible+ready is enough.
  const duringCssTransition = decideCardActionTap({
    targetPresent: true,
    controlReady: true,
    runtimeActionBlocked: false,
    localInFlight: false,
  });
  assert.equal(duringCssTransition.accept, true);
  pass('3. tap during animation after visible controls succeeds');
}

// —— 4. IncomingBanOverlay first tap path (source + decision) ——
{
  assert.match(incomingSrc, /decideCardActionTap/);
  assert.match(incomingSrc, /selectIsActionBlocked/);
  assert.doesNotMatch(incomingSrc, /allowOverlayUserTap\s*\(/);
  assert.doesNotMatch(incomingSrc, /actionLoading/);
  const d = decideCardActionTap({
    targetPresent: true,
    controlReady: true,
    runtimeActionBlocked: false,
    localInFlight: false,
  });
  assert.equal(d.accept, true);
  pass('4. IncomingBanOverlay first tap succeeds (no timer gate)');
}

// —— 5. Result-card buttons remain enabled until runtime/local pending ——
{
  assert.match(resultSrc, /decideCardActionTap/);
  assert.doesNotMatch(resultSrc, /allowOverlayUserTap\s*\(/);
  assert.match(resultSrc, /disabled=\{replyInFlight\}/);
  assert.match(resultSrc, /disabled=\{goToBansInFlight\}/);
  // Enabled while idle:
  const idle = decideCardActionTap({ localInFlight: false });
  assert.equal(idle.accept, true);
  pass('5. result-card buttons remain enabled until pending begins');
}

// —— 6. Pending action disables further submission ——
{
  const store = seed([incoming('A')]);
  const first = requestIncomingOverboardAction(store, {
    banId: 'A',
    commandId: 'cmd-A',
  });
  assert.equal(first.accepted, true);
  assert.equal(selectIsActionBlocked(store.getState()), true);
  const second = requestIncomingOverboardAction(store, {
    banId: 'A',
    commandId: 'cmd-A-2',
  });
  assert.equal(second.accepted, false);
  const blocked = decideCardActionTap({
    runtimeActionBlocked: selectIsActionBlocked(store.getState()),
    localInFlight: false,
  });
  assert.equal(blocked.accept, false);
  if (!blocked.accept) {
    assert.equal(blocked.reason, 'runtime-action-blocked');
  }
  pass('6. pending action disables further submission');
}

// —— 7. Completed (succeeded) action ignores further taps ——
{
  const base = createNotificationRuntimeStore().getState();
  const succeededBlocked = selectIsActionBlocked({
    ...base,
    action: {
      status: 'succeeded',
      commandId: 'cmd-done',
      targetItemId: 'check:C',
      errorCode: null,
    },
  });
  assert.equal(succeededBlocked, true);
  const d = decideCardActionTap({ runtimeActionBlocked: succeededBlocked });
  assert.equal(d.accept, false);
  if (!d.accept) assert.equal(d.reason, 'runtime-action-blocked');
  pass('7. completed action ignores further taps');
}

// —— 8. Rapid 20-click burst → exactly one submission ——
{
  let inFlight = false;
  const accepted = countAcceptedCardActionTaps(20, (_i, already) => {
    if (already > 0) inFlight = true;
    return decideCardActionTap({ localInFlight: inFlight || already > 0 });
  });
  assert.equal(accepted, 1);
  pass('8. rapid 20-click burst creates exactly one submission');
}

// —— 9. Remount during pending preserves lock ——
{
  const store = seed([incoming('R')]);
  requestIncomingOverboardAction(store, {
    banId: 'R',
    commandId: 'cmd-R',
  });
  assert.equal(selectIsActionBlocked(store.getState()), true);
  // Remount = new UI latch, but runtime state is the authority:
  const remountLocalInFlight = false;
  const d = decideCardActionTap({
    runtimeActionBlocked: selectIsActionBlocked(store.getState()),
    localInFlight: remountLocalInFlight,
  });
  assert.equal(d.accept, false);
  const again = requestIncomingOverboardAction(store, {
    banId: 'R',
    commandId: 'cmd-R-remount',
  });
  assert.equal(again.accepted, false);
  pass('9. remount during pending preserves lock');
}

// —— 10. Visibility transition cannot eat first tap ——
{
  // Prior action's markOverlayUserAction must not arm a timer that blocks next card.
  setOverlayInputLockAfterAction('incoming:prev');
  assert.equal(isOverlayInputLocked(), false);
  assert.equal(shouldBlockOverlayUserTap('incoming-next'), false);
  assert.equal(allowOverlayUserTap('incoming-next'), true);
  const firstOnNextCard = decideCardActionTap({
    controlReady: true,
    runtimeActionBlocked: false,
    localInFlight: false,
  });
  assert.equal(firstOnNextCard.accept, true);
  pass('10. visibility transition cannot eat first tap');
}

// —— Guard contract: no timer lock ——
{
  assert.doesNotMatch(guardSrc, /OVERLAY_INPUT_LOCK_MS\s*=\s*350/);
  assert.doesNotMatch(guardSrc, /setTimeout\s*\(/);
  assert.match(guardSrc, /stage6b-phase2/);
  pass('overlay-input-guard: timer lock retired');
}

// —— Source scans: result timer CTAs ——
{
  assert.doesNotMatch(instantBanSrc, /allowOverlayUserTap\s*\(/);
  assert.match(instantBanSrc, /resultTimerGoToBansInFlightRef/);
  assert.match(instantBanSrc, /resultTimerReplyInFlightRef/);
  assert.match(instantBanSrc, /decideCardActionTap/);
  pass('InstantBanFlow result-timer CTAs use sync latches');
}

// —— Runtime duplicate commandId ——
{
  const store = seed([incoming('D')]);
  const a = requestIncomingOverboardAction(store, {
    banId: 'D',
    commandId: 'same-cmd',
  });
  const b = requestIncomingOverboardAction(store, {
    banId: 'D',
    commandId: 'same-cmd',
  });
  assert.equal(a.accepted, true);
  assert.equal(b.accepted, false);
  pass('duplicate commandId rejected by runtime');
}

console.log(
  `notification-runtime-stage6b-action-determinism.test.ts: ${passed} passed`,
);
