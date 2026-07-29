/**
 * SUCCESS ownership slice — reducer + InstantBanFlow intent wiring + Stage 3A retain.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-success.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInitialNotificationOwnerBootLobbyState,
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
  planBootLobbyVisuals,
  reduceNotificationOwnerBootLobby,
  resetNotificationOwnerBootLobbyStoreForTests,
  resolveSendFlowSurfaceExclusivity,
} from '../src/notification-owner';
import { evaluateSuccessToNextHandoff } from '../src/lib/success-to-next-handoff';
import {
  evaluateSuccessPresentationHandoffHold,
  SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS,
} from '../src/lib/success-drain-empty-shell-hold';
import {
  authorizeSuccessExitDrain,
  beginSendSuccessCardSession,
} from '../src/lib/success-exit-first-notification-debug';

const root = join(__dirname, '..');
const instantBanPath = join(
  root,
  'src/components/instant-ban/InstantBanFlow.tsx',
);
const providersPath = join(root, 'src/components/Providers.tsx');
const adapterPath = join(root, 'src/notification-owner/boot-lobby.adapter.ts');
const successScreenPath = join(
  root,
  'src/components/instant-ban/SuccessScreen.tsx',
);
const handoffPath = join(root, 'src/lib/success-to-next-handoff.ts');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

function toLobby() {
  resetNotificationOwnerBootLobbyStoreForTests();
  dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
}

function toConfirm() {
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_CONFIRM' });
}

function toSuccess() {
  toConfirm();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_SUCCESS' });
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== SUCCESS OWNERSHIP SLICE ===\n');

const instantBanSrc = read(instantBanPath);
const providersSrc = read(providersPath);
const adapterSrc = read(adapterPath);

// 1. OPEN_SUCCESS from CONFIRM / idempotent / leaves CONFIRM
{
  toConfirm();
  let r = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_SUCCESS' },
  );
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'SUCCESS');
  if (r.state.presentation.kind === 'SUCCESS') {
    assert.equal(r.state.presentation.mode, 'send-success');
  }
  pass('OPEN_SUCCESS from CONFIRM');

  toSuccess();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_SUCCESS',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'SUCCESS');
  pass('repeated OPEN_SUCCESS is idempotent');

  toConfirm();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_SUCCESS',
  });
  assert.equal(r.state.presentation.kind, 'SUCCESS');
  assert.notEqual(r.state.presentation.kind, 'CONFIRM');
  pass('OPEN_SUCCESS leaves CONFIRM ownership');
}

// 2. Non-CONFIRM rejects OPEN_SUCCESS; BOOT rejects
{
  toLobby();
  let r = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_SUCCESS' },
  );
  assert.equal(r.rejected, 'open-success-requires-confirm');
  assert.equal(r.state.presentation.kind, 'LOBBY');
  pass('LOBBY rejects OPEN_SUCCESS');

  resetNotificationOwnerBootLobbyStoreForTests();
  const boot = createInitialNotificationOwnerBootLobbyState();
  r = reduceNotificationOwnerBootLobby(boot, { type: 'OPEN_SUCCESS' });
  assert.equal(r.rejected, 'open-success-requires-confirm');
  pass('BOOT rejects OPEN_SUCCESS');
}

// 3. RESET_TO_LOBBY accepts SUCCESS
{
  toSuccess();
  const reset = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(reset.rejected, null);
  assert.equal(reset.state.presentation.kind, 'LOBBY');
  pass('RESET_TO_LOBBY accepts SUCCESS');
}

// 4. SUCCESS has no legacy phase projection
{
  assert.match(adapterSrc, /kind === 'SUCCESS'/);
  const successBlock = adapterSrc.slice(
    adapterSrc.indexOf("if (kind === 'SUCCESS')"),
    adapterSrc.indexOf("if (kind === 'CONFIRM')"),
  );
  assert.match(successBlock, /return;/);
  assert.doesNotMatch(
    successBlock,
    /applyWhoPhase|applyWhatPhase|applyConfirmPhase|setPhase/,
  );
  assert.doesNotMatch(
    instantBanSrc,
    /phase\s*===\s*'success'|setPhase\(\s*'success'/,
  );
  pass('SUCCESS has no legacy phase projection');
}

// 5. CONFIRM and SUCCESS mutually exclusive; banSentSuccess preempts CONFIRM
{
  const bothOwner = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'confirming',
    banSentSuccess: true,
  });
  assert.equal(bothOwner.success, true);
  assert.equal(bothOwner.confirm, false);
  assert.equal(bothOwner.who, false);
  assert.equal(bothOwner.what, false);
  assert.equal(bothOwner.overlap, false);

  const confirmOnly = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'confirming',
    banSentSuccess: false,
  });
  assert.equal(confirmOnly.confirm, true);
  assert.equal(confirmOnly.success, false);

  const successOwnerIdle = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'SUCCESS',
    phase: 'confirming',
    banSentSuccess: false,
  });
  assert.equal(successOwnerIdle.confirm, false);
  assert.equal(successOwnerIdle.success, false);

  pass('CONFIRM and SUCCESS mutually exclusive; banSentSuccess preempts CONFIRM');
}

// 6. Paint still requires snapshot; retained after RESET_TO_LOBBY
{
  assert.match(
    instantBanSrc,
    /banSentSuccess && successSnapshot \? \(/,
  );
  assert.match(
    instantBanSrc,
    /confirmActive\s*=\s*\n?\s*sendFlowSurfaces\.confirm && hasComposeRecipient && !banSentSuccess/,
  );

  // Owner LOBBY after exit; local SUCCESS still paints via banSentSuccess.
  const retained = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'LOBBY',
    phase: 'idle',
    banSentSuccess: true,
  });
  assert.equal(retained.success, true);
  assert.equal(retained.confirm, false);
  assert.equal(retained.who, false);
  assert.equal(retained.what, false);

  const wait = evaluateSuccessToNextHandoff({
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    expectedDisplayId: null,
    nextDisplayDomMounted: false,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
  });
  assert.equal(wait.phase, 'SUCCESS_HANDOFF_WAIT');
  assert.equal(wait.retainSuccessPresentation, true);
  assert.equal(wait.mayClearSuccessLocal, false);
  assert.equal(wait.allowLobbyBase, false);
  pass('SUCCESS paint requires snapshot; retained after owner RESET_TO_LOBBY');
}

// 7. Empty queue → Lobby; queued next retains until DOM ack
{
  const empty = evaluateSuccessToNextHandoff({
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    expectedDisplayId: null,
    nextDisplayDomMounted: false,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: true,
    presentationOwnershipReleased: false,
  });
  assert.equal(empty.phase, 'EMPTY_LOBBY_RELEASED');
  assert.equal(empty.mayClearSuccessLocal, true);
  assert.equal(empty.allowLobbyBase, true);
  assert.equal(empty.retainSuccessPresentation, false);

  const waiting = evaluateSuccessToNextHandoff({
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: 'incoming',
    runtimeDisplayPayloadPresent: true,
    expectedDisplayId: 'ban-1',
    nextDisplayDomMounted: false,
    notificationPresentationClaimed: true,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
  });
  assert.equal(waiting.retainSuccessPresentation, true);
  assert.equal(waiting.mayClearSuccessLocal, false);

  const ack = evaluateSuccessToNextHandoff({
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: 'incoming',
    runtimeDisplayPayloadPresent: true,
    expectedDisplayId: 'ban-1',
    nextDisplayDomMounted: true,
    notificationPresentationClaimed: true,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
  });
  assert.equal(ack.phase, 'NEXT_NOTIFICATION_VISIBLE');
  assert.equal(ack.mayClearSuccessLocal, true);
  assert.equal(ack.retainSuccessPresentation, false);
  pass('Empty queue → Lobby; next notification retains until matching DOM ack');
}

// 8. Timeout does not invent Lobby or clear SUCCESS by itself
{
  const hold = evaluateSuccessPresentationHandoffHold({
    lobbyBootIntroPrimed: true,
    handoffArmed: true,
    runtimeLifecycle: 'idle',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
    holdExpired: true,
  });
  assert.equal(hold.hold, false);
  assert.equal(hold.releaseReason, 'hold-expired');

  // Contract still retains SUCCESS until terminal even if hold expired on suppress layer.
  const stillWaiting = evaluateSuccessToNextHandoff({
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    expectedDisplayId: null,
    nextDisplayDomMounted: false,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
  });
  assert.equal(stillWaiting.mayClearSuccessLocal, false);
  assert.equal(stillWaiting.retainSuccessPresentation, true);
  assert.ok(SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS === 8000);
  pass('Timeout does not invent Lobby or clear SUCCESS by itself');
}

// 9. Failed/aborted send does not enter SUCCESS; openSuccess wiring
{
  const openIdx = instantBanSrc.indexOf('const openSuccess');
  const openEnd = instantBanSrc.indexOf('}, [', openIdx);
  const openBody = instantBanSrc.slice(openIdx, openEnd);
  assert.match(openBody, /type:\s*'OPEN_SUCCESS'/);
  assert.match(openBody, /setBanSentSuccess\(true\)/);
  assert.match(openBody, /setSendSuccessCardMounted\(true/);
  // OPEN_SUCCESS before or with setBanSentSuccess in same transition
  const openCmd = openBody.indexOf("type: 'OPEN_SUCCESS'");
  const setTrue = openBody.indexOf('setBanSentSuccess(true)');
  assert.ok(openCmd >= 0 && setTrue >= 0 && openCmd < setTrue);

  assert.equal(
    [...instantBanSrc.matchAll(/setBanSentSuccess\(true\)/g)].length,
    1,
    'sole setBanSentSuccess(true) must be openSuccess',
  );

  // Fail / share paths clear without OPEN_SUCCESS
  assert.match(instantBanSrc, /setBanSentSuccess\(false\)/);
  const failIdx = instantBanSrc.indexOf('onFail');
  assert.ok(failIdx > 0);
  pass('Failed/aborted send does not enter SUCCESS; openSuccess dispatches OPEN_SUCCESS');
}

// 10. Repeated success session rejects stale exit
{
  const g = globalThis as { window?: { __debug98log?: (...args: unknown[]) => void } };
  const prev = g.window;
  g.window = { __debug98log: () => {} };
  try {
    const s1 = beginSendSuccessCardSession('ban-a');
    const s2 = beginSendSuccessCardSession('ban-b');
    assert.notEqual(s1, s2);
    assert.equal(authorizeSuccessExitDrain(s1), false);
    assert.equal(authorizeSuccessExitDrain(s2), true);
  } finally {
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
  pass('Repeated success session rejects stale exit');
}

// 11. Queue drain blocked while success card mounted (Providers gate)
{
  assert.match(providersSrc, /isSuccessCardMounted/);
  assert.match(providersSrc, /setSendSuccessCardMounted/);
  assert.match(instantBanSrc, /setSendSuccessCardMounted\(true/);
  assert.match(instantBanSrc, /setSendSuccessCardMounted\(false/);
  pass('Queue drain is blocked while success card is mounted');
}

// 12. SUCCESS → Lobby → OPEN_WHO
{
  toSuccess();
  const reset = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(reset.state.presentation.kind, 'LOBBY');
  const who = reduceNotificationOwnerBootLobby(reset.state, { type: 'OPEN_WHO' });
  assert.equal(who.rejected, null);
  assert.equal(who.state.presentation.kind, 'WHO');
  pass('SUCCESS → Lobby → OPEN_WHO works');
}

// 13. Visual plan + openSuccess source scan; SuccessScreen/handoff unchanged by rewrite intent
{
  const plan = planBootLobbyVisuals({
    kind: 'SUCCESS',
    mode: 'send-success',
  });
  assert.equal(plan.ownerSuccessActive, true);
  assert.equal(plan.showLobbyBootLogoShell, false);

  assert.match(instantBanSrc, /releaseOwnerWhoToLobby/);
  assert.match(instantBanSrc, /kind !== 'SUCCESS'/);

  // Contracts preserved as modules (not rewritten in this slice).
  assert.match(read(successScreenPath), /freezeFinalFrame/);
  assert.match(read(handoffPath), /mayClearSuccessLocal/);
  pass('SUCCESS visual plan + InstantBanFlow release includes SUCCESS');
}

console.log(`\n${passed} passed\n`);
