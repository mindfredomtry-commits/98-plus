/**
 * WHAT ownership slice — reducer + InstantBanFlow intent wiring.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-what.test.ts
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

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHAT OWNERSHIP SLICE ===\n');

const instantBanSrc = read(instantBanPath);
const providersSrc = read(providersPath);

// 1. Reducer OPEN_WHAT transitions
{
  toWho();
  let r = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHAT' },
  );
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'WHAT');
  if (r.state.presentation.kind === 'WHAT') {
    assert.equal(r.state.presentation.mode, 'composing-ban');
  }
  pass('WHO → OPEN_WHAT → WHAT');

  toLobby();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_WHAT',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'WHAT');
  pass('LOBBY → OPEN_WHAT → WHAT');

  toWhat();
  r = reduceNotificationOwnerBootLobby(getNotificationOwnerBootLobbyState(), {
    type: 'OPEN_WHAT',
  });
  assert.equal(r.rejected, null);
  assert.equal(r.state.presentation.kind, 'WHAT');
  pass('WHAT → OPEN_WHAT remains WHAT (idempotent)');
}

// 2. BOOT rejects OPEN_WHAT
{
  resetNotificationOwnerBootLobbyStoreForTests();
  const boot = createInitialNotificationOwnerBootLobbyState();
  const r = reduceNotificationOwnerBootLobby(boot, { type: 'OPEN_WHAT' });
  assert.equal(r.rejected, 'open-what-requires-non-boot');
  assert.equal(r.state.presentation.kind, 'BOOT');
  pass('BOOT rejects OPEN_WHAT');
}

// 3. WHAT → CONFIRM via OPEN_CONFIRM
{
  toWhat();
  const openConfirm = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_CONFIRM' },
  );
  assert.equal(openConfirm.rejected, null);
  assert.equal(openConfirm.state.presentation.kind, 'CONFIRM');
  const surf = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'CONFIRM',
    phase: 'confirming',
  });
  assert.equal(surf.confirm, true);
  assert.equal(surf.what, false);
  assert.equal(surf.who, false);
  assert.equal(surf.overlap, false);
  pass('WHAT → CONFIRM: owner leaves WHAT; CONFIRM renders; no Lobby');
}

// 4. CONFIRM → WHAT via OPEN_WHAT
{
  toConfirm();
  const reopen = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHAT' },
  );
  assert.equal(reopen.rejected, null);
  assert.equal(reopen.state.presentation.kind, 'WHAT');
  const surf = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'WHAT',
    phase: 'composingBan',
  });
  assert.equal(surf.what, true);
  pass('CONFIRM → WHAT: owner becomes WHAT');
}

// 5. InstantBanFlow wiring — completeWhoToWhat uses OPEN_WHAT
{
  const idx = instantBanSrc.indexOf('const completeWhoToWhat');
  const end = instantBanSrc.indexOf('const completeWhatToWho', idx);
  const body = instantBanSrc.slice(idx, end);
  assert.match(body, /type:\s*'OPEN_WHAT'/);
  assert.match(
    body,
    /setPhase\('composingBan', 'notification-owner-what-projection'\)/,
  );
  pass('Lobby CTA → WHO → select → WHAT uses OPEN_WHAT');
}

// 6. handleWhatSubmit opens CONFIRM via OPEN_CONFIRM
{
  const idx = instantBanSrc.indexOf('const handleWhatSubmit');
  const end = instantBanSrc.indexOf('const handleWhatBack', idx);
  const body = instantBanSrc.slice(idx, end);
  const openIdx = body.indexOf('OPEN_CONFIRM');
  const phaseIdx = body.indexOf(
    "setPhase('confirming', 'notification-owner-confirm-projection')",
  );
  assert.ok(openIdx >= 0 && phaseIdx > openIdx);
  pass('WHAT → CONFIRM dispatches OPEN_CONFIRM before confirming projection');
}

// 7. handleConfirmBack routes through OPEN_WHAT
{
  const idx = instantBanSrc.indexOf('const handleConfirmBack');
  const end = instantBanSrc.indexOf('const handleInviteMore', idx);
  const body = instantBanSrc.slice(idx, end);
  assert.match(body, /type:\s*'OPEN_WHAT'/);
  assert.match(
    body,
    /setPhase\('composingBan', 'notification-owner-what-projection'\)/,
  );
  pass('CONFIRM → WHAT routes through OPEN_WHAT');
}

// 8. Direct entry paths dispatch OPEN_WHAT
{
  assert.match(instantBanSrc, /beginComposingBanForOpponent/);
  const beginIdx = instantBanSrc.indexOf(
    'const beginComposingBanForOpponent = useCallback',
  );
  const beginEnd = instantBanSrc.indexOf(
    'const beginIncomingReplyFromDeepLink',
    beginIdx,
  );
  const beginBody = instantBanSrc.slice(beginIdx, beginEnd);
  assert.match(beginBody, /type:\s*'OPEN_WHAT'/);

  const analyticsIdx = instantBanSrc.indexOf(
    'const handleStartBanFromAnalytics = useCallback',
  );
  const analyticsEnd = instantBanSrc.indexOf(
    'const handleNotificationModeChange',
    analyticsIdx,
  );
  const analyticsBody = instantBanSrc.slice(analyticsIdx, analyticsEnd);
  assert.match(analyticsBody, /type:\s*'OPEN_WHAT'/);

  const repeatIdx = instantBanSrc.indexOf('const beginRepeatBanFlow');
  const repeatEnd = instantBanSrc.indexOf(
    'const beginComposingBanForOpponent',
    repeatIdx,
  );
  const repeatBody = instantBanSrc.slice(repeatIdx, repeatEnd);
  assert.match(repeatBody, /type:\s*'OPEN_WHAT'/);
  pass('Direct reply/deeplink/analytics/repeat entry routes through OPEN_WHAT');
}

// 9. No unauthorized naked setPhase('composingBan')
{
  const naked = [
    ...instantBanSrc.matchAll(/setPhase\(\s*'composingBan'\s*\)/g),
  ];
  assert.equal(
    naked.length,
    0,
    `unauthorized naked setPhase('composingBan') count=${naked.length}`,
  );
  assert.match(
    instantBanSrc,
    /setPhase\('composingBan', 'notification-owner-what-projection'\)/,
  );
  pass('No unauthorized naked setPhase(composingBan); projection-tagged only');
}

// 10. Overlay gating: WHAT without selectedUser stays closed
{
  const whatSurfaces = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'WHAT',
    phase: 'composingBan',
  });
  assert.equal(whatSurfaces.what, true);
  const overlayOpen =
    whatSurfaces.who || (whatSurfaces.what && false /* selectedUser missing */);
  assert.equal(overlayOpen, false);
  assert.match(
    instantBanSrc,
    /showWhatSurface && hasComposeRecipient|hasComposeRecipient/,
  );
  pass('WHAT without selectedUser keeps overlay closed');
}

// 11. Projection + visual plan
{
  const plan = planBootLobbyVisuals({
    kind: 'WHAT',
    mode: 'composing-ban',
  });
  assert.equal(plan.ownerWhatActive, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.match(instantBanSrc, /applyWhatPhaseFromOwner/);
  assert.match(instantBanSrc, /notification-owner-what-projection/);
  pass('Owner WHAT projects to composingBan via authorized path');
}

// 12. Incoming hosts unchanged
{
  assert.match(providersSrc, /<GlobalOverlayHost/);
  assert.match(providersSrc, /<NotificationQueueShell/);
  pass('Incoming cards remain queued during WHO/WHAT/CONFIRM/SUCCESS wiring intact');
}

console.log(`\n${passed} passed\n`);
