/**
 * Overlay-shell gating must match child renderability.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-overlay-gating.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSendFlowSurfaceExclusivity } from '../src/notification-owner';

const root = join(__dirname, '..');
const instantBanPath = join(
  root,
  'src/components/instant-ban/InstantBanFlow.tsx',
);

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

console.log('\n=== Overlay shell render gating ===\n');

const src = read(instantBanPath);

// Gate should require selectedUser for the WHAT branch.
assert.match(src, /showCrossScreenPager[\s\S]*selectedUser != null/);
assert.match(src, /showWhoSurface.*showWhatSurface.*selectedUser != null/);
pass('InstantBanFlow: showCrossScreenPager gates WHAT on selectedUser');

function overlayOpenCandidate(input: {
  ownerKind: 'BOOT' | 'LOBBY' | 'WHO' | 'LEGACY_FLOW';
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

function pass(name: string): void {
  console.log(`PASS — ${name}`);
}

// 1. showWhatSurface=true + selectedUser=null => overlay must be closed
{
  const open = overlayOpenCandidate({
    ownerKind: 'LEGACY_FLOW',
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
    ownerKind: 'LEGACY_FLOW',
    phase: 'composingBan',
    selectedUserPresent: true,
  });
  assert.equal(open, true);
  pass('overlay open when WHAT active and selectedUser present');
}

// 4. overlay cannot open when both WHO and WHAT are non-renderable
{
  const open = overlayOpenCandidate({
    ownerKind: 'WHO',
    phase: 'composingBan',
    selectedUserPresent: false,
  });
  assert.equal(open, false);
  pass('overlay closed when neither WHO nor WHAT renderable');
}

// 5. SUCCESS -> Lobby -> press "Запрещать" => WHO materializes
{
  // Rare production failure shape:
  // legacy phase stayed on composingBan after SUCCESS cleanup,
  // selectedUser was cleared, and the shell opened with no child.
  const stalePostSuccessComposeOpen = overlayOpenCandidate({
    ownerKind: 'LOBBY',
    phase: 'composingBan',
    selectedUserPresent: false,
  });
  assert.equal(stalePostSuccessComposeOpen, false);

  // After pressing "Запрещать", owner enters WHO and WHO becomes renderable.
  const whoAfterPressingBan = overlayOpenCandidate({
    ownerKind: 'WHO',
    phase: 'selectingTarget',
    selectedUserPresent: false,
  });
  assert.equal(whoAfterPressingBan, true);
  pass('SUCCESS -> Lobby -> press "Запрещать" materializes WHO instead of empty shell');
}

console.log('\nOK\n');

