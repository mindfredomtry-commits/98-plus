/**
 * Overlay-shell gating must match child renderability (WHAT ownership).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-overlay-gating.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
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

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

function pass(name: string): void {
  console.log(`PASS — ${name}`);
}

function overlayOpenCandidate(input: {
  ownerKind: 'BOOT' | 'LOBBY' | 'WHO' | 'WHAT' | 'CONFIRM' | 'LEGACY_FLOW';
  phase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
  selectedUserPresent: boolean;
}): boolean {
  const surfaces = resolveSendFlowSurfaceExclusivity({
    ownerKind: input.ownerKind,
    phase: input.phase,
  });
  // Mirror component logic with activeBanDeepLinkBooting=false.
  return surfaces.who || (surfaces.what && input.selectedUserPresent);
}

console.log('\n=== Overlay shell render gating ===\n');

const src = read(instantBanPath);

// Gate should require selectedUser for the WHAT branch.
assert.match(src, /showCrossScreenPager[\s\S]*selectedUser != null/);
assert.match(src, /showWhoSurface.*showWhatSurface.*selectedUser != null/);
pass('InstantBanFlow: showCrossScreenPager gates WHAT on selectedUser');

// 1. showWhatSurface=true + selectedUser=null => overlay must be closed
{
  const open = overlayOpenCandidate({
    ownerKind: 'WHAT',
    phase: 'composingBan',
    selectedUserPresent: false,
  });
  assert.equal(open, false);
  pass('overlay closed when WHAT active but selectedUser missing');
}

// 2. showWhoSurface=true => overlay and WHO materialize (WHO does not require selectedUser)
{
  const open = overlayOpenCandidate({
    ownerKind: 'WHO',
    phase: 'selectingTarget',
    selectedUserPresent: false,
  });
  assert.equal(open, true);
  pass('overlay open when WHO active even if selectedUser missing');
}

// 3. showWhatSurface=true + selectedUser present => overlay and WHAT materialize
{
  const open = overlayOpenCandidate({
    ownerKind: 'WHAT',
    phase: 'composingBan',
    selectedUserPresent: true,
  });
  assert.equal(open, true);
  pass('overlay open when WHAT active and selectedUser present');
}

// 4. overlay cannot open when both WHO and WHAT are non-renderable
{
  const open = overlayOpenCandidate({
    ownerKind: 'WHAT',
    phase: 'selectingTarget',
    selectedUserPresent: false,
  });
  assert.equal(open, false);
  pass('overlay closed when neither WHO nor WHAT renderable');
}

// 5. Complete product flow:
// SUCCESS → Lobby → press "Запрещать" → WHO materializes
{
  const successExitIdx = src.indexOf("prepareLobbyBaseAfterSuccess('send-success'");
  assert.ok(successExitIdx > 0);
  const successExitWindow = src.slice(
    Math.max(0, successExitIdx - 2500),
    successExitIdx + 200,
  );
  assert.match(successExitWindow, /setSelectedUser\(null\)/);
  assert.match(successExitWindow, /releaseOwnerWhoToLobby\(\)/);
  assert.match(successExitWindow, /setPhase\('idle'\)/);
  assert.match(
    src,
    /dispatchNotificationOwnerBootLobby\(\{\s*type:\s*'RESET_TO_LOBBY'\s*\}\)/,
  );

  const beginIdx = src.indexOf('const handleBeginSend = useCallback');
  const beginEnd = src.indexOf('const beginNewBanWhoFlow = useCallback', beginIdx);
  assert.ok(beginIdx >= 0 && beginEnd > beginIdx);
  const beginBody = src.slice(beginIdx, beginEnd);
  assert.match(beginBody, /type:\s*'OPEN_WHO'/);
  assert.doesNotMatch(beginBody, /setPhase\(\s*'selectingTarget'/);
  assert.match(src, /onBeginSend=\{handleBeginSend\}/);

  assert.match(src, /showWhoSurface \? \(/);
  assert.match(src, /<WhoOverlay[\s\S]*gestureZoneActive=\{whoDismissGestureActive\}/);
  assert.match(src, /const overlayOpen = showCrossScreenPager/);
  assert.match(
    src,
    /setPhase\('selectingTarget', 'notification-owner-who-projection'\)/,
  );

  resetNotificationOwnerBootLobbyStoreForTests();
  dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
  assert.equal(
    getNotificationOwnerBootLobbyState().presentation.kind,
    'WHAT',
  );

  const afterSuccess = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(afterSuccess.rejected, null);
  assert.equal(afterSuccess.state.presentation.kind, 'LOBBY');
  resetNotificationOwnerBootLobbyStoreForTests(afterSuccess.state);

  // Stale post-SUCCESS: without owner WHAT, composingBan alone cannot open WHAT.
  const staleEmptyShell = overlayOpenCandidate({
    ownerKind: 'LOBBY',
    phase: 'composingBan',
    selectedUserPresent: false,
  });
  assert.equal(staleEmptyShell, false);
  const staleSurfaces = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'LOBBY',
    phase: 'composingBan',
  });
  assert.equal(staleSurfaces.who, false);
  assert.equal(staleSurfaces.what, false);

  const afterCta = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHO' },
  );
  assert.equal(afterCta.rejected, null);
  assert.equal(afterCta.state.presentation.kind, 'WHO');

  const whoSurfaces = resolveSendFlowSurfaceExclusivity({
    ownerKind: 'WHO',
    phase: 'selectingTarget',
  });
  assert.equal(whoSurfaces.who, true);
  assert.equal(whoSurfaces.what, false);
  assert.equal(whoSurfaces.overlap, false);
  assert.equal(
    overlayOpenCandidate({
      ownerKind: 'WHO',
      phase: 'selectingTarget',
      selectedUserPresent: false,
    }),
    true,
  );

  pass(
    'SUCCESS → Lobby → press "Запрещать" → WHO materializes (product flow)',
  );
}

console.log('\nOK\n');
