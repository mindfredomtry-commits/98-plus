/**
 * CONFIRM ownership slice — reducer + InstantBanFlow intent wiring.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-confirm.test.ts
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

const root = join(__dirname, '..');
const instantBanPath = join(
  root,
  'src/components/instant-ban/InstantBanFlow.tsx',
);
const providersPath = join(root, 'src/components/Providers.tsx');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

function toLobby() {
  resetNotificationOwnerBootLobbyStoreForTests();
  dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
}

function toWho() {
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
}

function toWhat() {
  toWho();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
}

function toConfirm() {
  toWhat();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_CONFIRM' });
}

function toLegacy() {
  toWho();
  dispatchNotificationOwnerBootLobby({ type: 'LEAVE_WHO_FOR_LEGACY_FLOW' });
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== CONFIRM OWNERSHIP SLICE ===\n');

const instantBanSrc = read(instantBanPath);
const providersSrc = read(providersPath);

// 1. OPEN_CONFIRM from WHAT / WHO / LOBBY / LEGACY_FLOW / CONFIRM
{
  toWhat();
  let r = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_CONFIRM' },
  );
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'CONFIRM');
  if (r.state.presentation.kind === 'CONFIRM') {
    assert.equal(r.state.presentation.mode, 'confirming');
  }
  pass('OPEN_CONFIRM from WHAT');

  toWho();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_CONFIRM',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'CONFIRM');
  pass('OPEN_CONFIRM from WHO');

  toLobby();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_CONFIRM',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'CONFIRM');
  pass('OPEN_CONFIRM from LOBBY');

  toLegacy();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_CONFIRM',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'CONFIRM');
  pass('OPEN_CONFIRM from LEGACY_FLOW');

  toConfirm();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_CONFIRM',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'CONFIRM');
  pass('repeated OPEN_CONFIRM is idempotent');
}

// 2. BOOT rejects OPEN_CONFIRM
{
  resetNotificationOwnerBootLobbyStoreForTests();
  const boot = createInitialNotificationOwnerBootLobbyState();
  const r = reduceNotificationOwnerBootLobby(boot, { type: 'OPEN_CONFIRM' });
  assert.equal(r.rejected, 'open-confirm-requires-non-boot');
  assert.equal(r.state.presentation.kind, 'BOOT');
  pass('BOOT rejects OPEN_CONFIRM');
}

// 3. WHAT → CONFIRM has no Lobby owner frame
{
  toWhat();
  const open = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_CONFIRM' },
  );
  assert.equal(open.state.presentation.kind, 'CONFIRM');
  assert.notEqual(open.state.presentation.kind, 'LOBBY');
  const plan = planBootLobbyVisuals(open.state.presentation);
  assert.equal(plan.ownerConfirmActive, true);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.showLobbyBootLogoShell, false);
  pass('WHAT → CONFIRM has no Lobby owner frame');
}

// 4. CONFIRM → WHAT leaves CONFIRM ownership
{
  toConfirm();
  const reopen = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHAT' },
  );
  assert.equal(reopen.rejected, null);
  assert.equal(reopen.state.presentation.kind, 'WHAT');
  const mid = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'composingBan',
  });
  assert.equal(mid.confirm, false);
  assert.equal(mid.what, false);
  pass('CONFIRM → WHAT leaves CONFIRM ownership');
}

// 5. CONFIRM and WHAT mutually exclusive + selectedUser / SUCCESS
{
  const bothBad = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'composingBan',
  });
  assert.equal(bothBad.what, false);
  assert.equal(bothBad.confirm, false);
  assert.equal(bothBad.overlap, false);

  const confirmOk = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'confirming',
  });
  assert.equal(confirmOk.confirm, true);
  assert.equal(confirmOk.what, false);
  assert.equal(confirmOk.who, false);

  // Paint still requires selectedUser at InstantBanFlow confirmActive.
  assert.match(
    instantBanSrc,
    /confirmActive\s*=\s*\n?\s*sendFlowSurfaces\.confirm && selectedUser != null && !banSentSuccess/,
  );

  const success = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'confirming',
    banSentSuccess: true,
  });
  assert.equal(success.success, true);
  assert.equal(success.confirm, false);
  assert.equal(success.what, false);
  assert.equal(success.overlap, false);
  pass('CONFIRM and WHAT mutually exclusive; paint needs selectedUser; SUCCESS preempts');
}

// 6. RESET_TO_LOBBY removes CONFIRM ownership
{
  toConfirm();
  const reset = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(reset.rejected, null);
  assert.equal(reset.state.presentation.kind, 'LOBBY');
  pass('RESET_TO_LOBBY removes CONFIRM ownership');
}

// 7. InstantBanFlow wiring
{
  const submitIdx = instantBanSrc.indexOf('const handleWhatSubmit');
  const submitEnd = instantBanSrc.indexOf('const handleWhatBack', submitIdx);
  const submitBody = instantBanSrc.slice(submitIdx, submitEnd);
  assert.match(submitBody, /type:\s*'OPEN_CONFIRM'/);
  assert.match(
    submitBody,
    /setPhase\('confirming', 'notification-owner-confirm-projection'\)/,
  );
  assert.doesNotMatch(submitBody, /LEAVE_WHAT_FOR_LEGACY_FLOW/);

  const backIdx = instantBanSrc.indexOf('const handleConfirmBack');
  const backEnd = instantBanSrc.indexOf('const handleInviteMore', backIdx);
  const backBody = instantBanSrc.slice(backIdx, backEnd);
  assert.match(backBody, /type:\s*'OPEN_WHAT'/);
  assert.match(backBody, /RESET_TO_LOBBY|releaseOwnerWhoToLobby/);

  const repeatIdx = instantBanSrc.indexOf('const beginRepeatBanFlow');
  const repeatEnd = instantBanSrc.indexOf(
    'const beginComposingBanForOpponent',
    repeatIdx,
  );
  const repeatBody = instantBanSrc.slice(repeatIdx, repeatEnd);
  assert.match(repeatBody, /type:\s*'OPEN_CONFIRM'/);
  assert.doesNotMatch(repeatBody, /LEAVE_WHO_FOR_LEGACY_FLOW/);
  assert.doesNotMatch(repeatBody, /LEAVE_WHAT_FOR_LEGACY_FLOW/);

  assert.match(instantBanSrc, /applyConfirmPhaseFromOwner/);
  assert.match(instantBanSrc, /handleConfirmRelease/);
  assert.match(instantBanSrc, /handleRetrySend/);
  pass('Direct archive/repeat goToConfirm path uses OPEN_CONFIRM');
  pass('Failed send remains on CONFIRM (retry/abort wiring intact)');
}

// 8. No unauthorized naked setPhase('confirming')
{
  const naked = [
    ...instantBanSrc.matchAll(/setPhase\(\s*'confirming'\s*\)/g),
  ];
  assert.equal(
    naked.length,
    0,
    `unauthorized naked setPhase('confirming') count=${naked.length}`,
  );
  assert.match(
    instantBanSrc,
    /setPhase\('confirming', 'notification-owner-confirm-projection'\)/,
  );
  pass('No unauthorized naked setPhase(confirming); projection-tagged only');
}

// 9. Incoming hosts unchanged
{
  assert.match(providersSrc, /<GlobalOverlayHost/);
  assert.match(providersSrc, /<NotificationQueueShell/);
  pass('Incoming cards remain queued during WHO/WHAT/CONFIRM/SUCCESS wiring intact');
}

console.log(`\n${passed} passed\n`);
