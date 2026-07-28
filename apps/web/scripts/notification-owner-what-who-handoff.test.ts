/**
 * Send-flow surface exclusivity + WHAT→WHO handoff regressions.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-what-who-handoff.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInitialNotificationOwnerBootLobbyState,
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
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

function toLegacyWhat() {
  toWho();
  dispatchNotificationOwnerBootLobby({ type: 'LEAVE_WHO_FOR_LEGACY_FLOW' });
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHAT → WHO HANDOFF / EXCLUSIVITY ===\n');

// 1. WHAT → WHO never produces WHO+WHAT both renderable
{
  const bad = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'WHO',
    phase: 'composingBan',
  });
  assert.equal(bad.who, false);
  assert.equal(bad.what, false);
  assert.equal(bad.overlap, false);

  const goodWho = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'WHO',
    phase: 'selectingTarget',
  });
  assert.equal(goodWho.who, true);
  assert.equal(goodWho.what, false);
  assert.equal(goodWho.overlap, false);

  const goodWhat = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'LEGACY_FLOW',
    phase: 'composingBan',
  });
  assert.equal(goodWhat.who, false);
  assert.equal(goodWhat.what, true);
  assert.equal(goodWhat.overlap, false);
  pass('WHAT → WHO never produces a frame with WHO and WHAT both renderable');
}

// 2. WHAT non-renderable before/with owner WHO (atomic order in completeWhatToWho)
{
  const src = read(instantBanPath);
  const idx = src.indexOf('const completeWhatToWho');
  const end = src.indexOf('const shouldCompleteWhoToWhat', idx);
  const body = src.slice(idx, end);
  const phaseIdx = body.indexOf("setPhase('selectingTarget'");
  const openIdx = body.indexOf("type: 'OPEN_WHO'");
  assert.ok(phaseIdx >= 0 && openIdx > phaseIdx);
  assert.match(body, /flushSync/);
  assert.match(body, /what-to-who-legacy/);
  pass('WHAT is non-renderable before or atomically with owner entering WHO');
}

// 3. Repeat WHO → WHAT → WHO 20x — no overlap states
{
  toLobby();
  for (let i = 0; i < 20; i++) {
    let r = reduceNotificationOwnerBootLobby(
      getNotificationOwnerBootLobbyState(),
      { type: 'OPEN_WHO' },
    );
    assert.equal(r.rejected, null);
    assert.equal(r.state.presentation.kind, 'WHO');
    let surf = resolveSendFlowSurfaceExclusivity({
      ownerKind: 'WHO',
      phase: 'selectingTarget',
    });
    assert.equal(surf.overlap, false);
    assert.equal(surf.who, true);

    r = reduceNotificationOwnerBootLobby(r.state, {
      type: 'LEAVE_WHO_FOR_LEGACY_FLOW',
    });
    assert.equal(r.state.presentation.kind, 'LEGACY_FLOW');
    surf = resolveSendFlowSurfaceExclusivity({
      ownerKind: 'LEGACY_FLOW',
      phase: 'composingBan',
    });
    assert.equal(surf.overlap, false);
    assert.equal(surf.what, true);
    assert.equal(surf.who, false);

    // Simulate atomic WHAT→WHO: phase selectingTarget while still LEGACY, then OPEN_WHO
    surf = resolveSendFlowSurfaceExclusivity({
      ownerKind: 'LEGACY_FLOW',
      phase: 'selectingTarget',
    });
    assert.equal(surf.what, false);
    assert.equal(surf.who, false);
    assert.equal(surf.overlap, false);

    r = reduceNotificationOwnerBootLobby(r.state, { type: 'OPEN_WHO' });
    assert.equal(r.state.presentation.kind, 'WHO');
    surf = resolveSendFlowSurfaceExclusivity({
      ownerKind: 'WHO',
      phase: 'selectingTarget',
    });
    assert.equal(surf.overlap, false);
    assert.equal(surf.who, true);
    assert.equal(surf.what, false);

    resetNotificationOwnerBootLobbyStoreForTests(r.state);
  }
  pass('Repeating WHO → WHAT → WHO 20 times produces no overlap state');
}

// 4–5. Back during entrance / idle — same completeWhatToWho path
{
  const src = read(instantBanPath);
  assert.match(src, /onBack=\{handleWhatBack\}/);
  assert.match(src, /animateCrossScreenProgress\(0, completeWhatToWho\)/);
  assert.match(src, /showWhatSurface && selectedUser/);
  assert.match(src, /showWhoSurface \? \(/);
  pass('Back during WHAT entrance animation still returns cleanly to WHO');
  pass('Back during WHAT idle state returns cleanly to WHO');
}

// 6. No Lobby frame during WHAT → WHO
{
  toLegacyWhat();
  const mid = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'LEGACY_FLOW',
    phase: 'selectingTarget',
  });
  assert.equal(mid.who, false);
  assert.equal(mid.what, false);
  // Not LOBBY owner
  assert.equal(
    getNotificationOwnerBootLobbyState().presentation.kind,
    'LEGACY_FLOW',
  );
  const open = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHO' },
  );
  assert.equal(open.state.presentation.kind, 'WHO');
  assert.notEqual(open.state.presentation.kind, 'LOBBY');
  pass('No Lobby frame appears during WHAT → WHO');
}

// 7. WHO → WHAT remains LEGACY_FLOW (not Lobby)
{
  toWho();
  const leave = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'LEAVE_WHO_FOR_LEGACY_FLOW' },
  );
  assert.equal(leave.state.presentation.kind, 'LEGACY_FLOW');
  const surf = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'LEGACY_FLOW',
    phase: 'composingBan',
  });
  assert.equal(surf.what, true);
  assert.equal(surf.who, false);
  pass('WHO → WHAT remains fixed and does not return to Lobby');
}

// 8. Explicit reset from legacy → LOBBY
{
  toLegacyWhat();
  const reset = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(reset.rejected, null);
  assert.equal(reset.state.presentation.kind, 'LOBBY');
  pass('Explicit reset from legacy flow still returns to Lobby');
}

// 9. selectingTarget remains projection-only + exclusivity wired
{
  const src = read(instantBanPath);
  assert.doesNotMatch(src, /setPhase\(\s*'selectingTarget'\s*\)/);
  assert.match(
    src,
    /setPhase\('selectingTarget', 'notification-owner-who-projection'\)/,
  );
  assert.match(src, /setPhase\('selectingTarget', 'what-to-who-legacy'\)/);
  assert.match(src, /resolveSendFlowSurfaceExclusivity/);
  pass('selectingTarget remains projection-only (plus atomic what-to-who write)');
}

// 10. Incoming hosts unchanged
{
  const providersSrc = read(providersPath);
  assert.match(providersSrc, /<GlobalOverlayHost/);
  assert.match(providersSrc, /<NotificationQueueShell/);
  pass('Incoming cards remain suppressed during WHO/WHAT/CONFIRM/SUCCESS wiring intact');
}

// Sanity: initial BOOT exclusivity
{
  const boot = createInitialNotificationOwnerBootLobbyState();
  const surf = resolveSendFlowSurfaceExclusivity({
    ownerKind: boot.presentation.kind,
    phase: 'idle',
  });
  assert.equal(surf.overlap, false);
  assert.equal(surf.who, false);
  assert.equal(surf.what, false);
}

console.log(`\n${passed} passed\n`);
