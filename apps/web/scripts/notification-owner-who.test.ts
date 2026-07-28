/**
 * WHO ownership slice — reducer + InstantBanFlow intent wiring.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-who.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInitialNotificationOwnerBootLobbyState,
  planBootLobbyVisuals,
  reduceNotificationOwnerBootLobby,
  resetNotificationOwnerBootLobbyStoreForTests,
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
} from '../src/notification-owner';

const root = join(__dirname, '..');
const pagePath = join(root, 'src/app/(miniapp)/page.tsx');
const providersPath = join(root, 'src/components/Providers.tsx');
const instantBanPath = join(
  root,
  'src/components/instant-ban/InstantBanFlow.tsx',
);
const whoScreenPath = join(root, 'src/components/instant-ban/WhoScreen.tsx');
const ownerDir = join(root, 'src/notification-owner');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

function toLobby() {
  resetNotificationOwnerBootLobbyStoreForTests();
  dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
  assert.equal(getNotificationOwnerBootLobbyState().presentation.kind, 'LOBBY');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHO OWNERSHIP SLICE ===\n');

// 1. LOBBY + OPEN_WHO → WHO
{
  toLobby();
  const result = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHO' },
  );
  assert.equal(result.rejected, null);
  assert.equal(result.state.presentation.kind, 'WHO');
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  assert.equal(getNotificationOwnerBootLobbyState().presentation.kind, 'WHO');
  pass('LOBBY + OPEN_WHO → WHO');
}

// 2. WHO + CLOSE_WHO → LOBBY
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  const result = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'CLOSE_WHO' },
  );
  assert.equal(result.rejected, null);
  assert.equal(result.state.presentation.kind, 'LOBBY');
  pass('WHO + CLOSE_WHO → LOBBY');
}

// 3. WHO + RESET_TO_LOBBY → LOBBY
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  const result = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(result.rejected, null);
  assert.equal(result.state.presentation.kind, 'LOBBY');
  pass('WHO + RESET_TO_LOBBY → LOBBY');
}

// 4. BOOT ignores OPEN_WHO
{
  resetNotificationOwnerBootLobbyStoreForTests();
  const boot = createInitialNotificationOwnerBootLobbyState();
  assert.equal(boot.presentation.kind, 'BOOT');
  const result = reduceNotificationOwnerBootLobby(boot, { type: 'OPEN_WHO' });
  assert.equal(result.rejected, 'open-who-requires-lobby');
  assert.equal(result.state.presentation.kind, 'BOOT');
  pass('BOOT ignores OPEN_WHO');
}

// 5. Repeated OPEN_WHO is idempotent
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  const again = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHO' },
  );
  assert.equal(again.rejected, null);
  assert.equal(again.state.presentation.kind, 'WHO');
  pass('Repeated OPEN_WHO is idempotent');
}

// 6. Repeated CLOSE_WHO is idempotent
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  dispatchNotificationOwnerBootLobby({ type: 'CLOSE_WHO' });
  const again = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'CLOSE_WHO' },
  );
  assert.equal(again.rejected, null);
  assert.equal(again.state.presentation.kind, 'LOBBY');
  pass('Repeated CLOSE_WHO is idempotent');
}

// 7. Owner WHO projects to existing WhoOverlay path (plan + live InstantBanFlow)
{
  const plan = planBootLobbyVisuals({
    kind: 'WHO',
    mode: 'selecting-target',
  });
  assert.equal(plan.ownerWhoActive, true);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  const instantBanSrc = read(instantBanPath);
  assert.match(instantBanSrc, /WhoOverlay/);
  assert.match(instantBanSrc, /useNotificationOwnerWhoProjection/);
  assert.match(
    instantBanSrc,
    /setPhase\('selectingTarget', 'notification-owner-who-projection'\)/,
  );
  pass('Owner state projects correctly into existing WHO renderer input');
}

const instantBanSrc = read(instantBanPath);
const pageSrc = read(pagePath);
const providersSrc = read(providersPath);
const whoSrc = read(whoScreenPath);

// 8. Lobby CTA dispatches owner intent
assert.match(instantBanSrc, /handleBeginSend/);
assert.match(
  instantBanSrc,
  /dispatchNotificationOwnerBootLobby\(\{\s*type:\s*'OPEN_WHO'\s*\}\)/,
);
// CTA path must not directly set selectingTarget
{
  const beginIdx = instantBanSrc.indexOf('const handleBeginSend = useCallback');
  const beginEnd = instantBanSrc.indexOf(
    'const beginNewBanWhoFlow = useCallback',
    beginIdx,
  );
  assert.ok(beginIdx >= 0 && beginEnd > beginIdx);
  const beginBody = instantBanSrc.slice(beginIdx, beginEnd);
  assert.match(beginBody, /type:\s*'OPEN_WHO'/);
  assert.doesNotMatch(beginBody, /setPhase\(\s*'selectingTarget'/);
  pass('Lobby CTA dispatches owner intent');
}

// 9. WHO back dispatches owner intent
{
  const dismissIdx = instantBanSrc.indexOf(
    'const handleWhoDismissToLobby = useCallback',
  );
  const dismissEnd = instantBanSrc.indexOf('useEffect(() => {', dismissIdx);
  assert.ok(dismissIdx >= 0 && dismissEnd > dismissIdx);
  const dismissBody = instantBanSrc.slice(dismissIdx, dismissEnd);
  assert.match(dismissBody, /type:\s*'CLOSE_WHO'/);
  assert.doesNotMatch(dismissBody, /finishWhoDismiss\(\)/);
  pass('WHO back dispatches owner intent');
}

// 10. No direct legacy WHO open write remains
assert.doesNotMatch(instantBanSrc, /setPhase\(\s*'selectingTarget'\s*\)/);
assert.match(
  instantBanSrc,
  /setPhase\('selectingTarget', 'notification-owner-who-projection'\)/,
);
pass('No direct legacy WHO open write remains');

// 11. No direct legacy WHO close write from dismiss handler
{
  const dismissIdx = instantBanSrc.indexOf(
    'const handleWhoDismissToLobby = useCallback',
  );
  const dismissEnd = instantBanSrc.indexOf('useEffect(() => {', dismissIdx);
  const dismissBody = instantBanSrc.slice(dismissIdx, dismissEnd);
  assert.doesNotMatch(dismissBody, /setPhase\(\s*'idle'/);
  assert.match(
    instantBanSrc,
    /setPhase\('idle', 'notification-owner-who-close-projection'\)/,
  );
  pass('No direct legacy WHO close write remains');
}

// 12. WHO → WHAT does not produce a Lobby frame (owner → WHAT, not LOBBY)
assert.match(instantBanSrc, /OPEN_WHAT/);
assert.match(instantBanSrc, /leaveWhoForLegacyRef/);
assert.match(instantBanSrc, /notification-owner-what-projection/);
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  const openWhat = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHAT' },
  );
  assert.equal(openWhat.rejected, null);
  assert.equal(openWhat.state.presentation.kind, 'WHAT');
  assert.notEqual(openWhat.state.presentation.kind, 'LOBBY');
  const plan = planBootLobbyVisuals(openWhat.state.presentation);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, true);
  assert.equal(plan.ownerLegacyFlowActive, false);
  assert.equal(plan.showLobbyBootLogoShell, false);

  const whoToWhatIdx = instantBanSrc.indexOf('const completeWhoToWhat');
  const whoToWhatEnd = instantBanSrc.indexOf(
    'const completeWhatToWho',
    whoToWhatIdx,
  );
  const body = instantBanSrc.slice(whoToWhatIdx, whoToWhatEnd);
  // OPEN_WHAT must happen before composingBan projection write
  const openIdx = body.indexOf('OPEN_WHAT');
  const phaseIdx = body.indexOf("setPhase('composingBan'");
  assert.ok(openIdx >= 0 && phaseIdx > openIdx);
  assert.doesNotMatch(body, /flushSync\s*\(/);
  pass('WHO → WHAT does not produce a Lobby frame');
}

// 12b. WHO → WHAT preserves composingBan write after OPEN_WHAT
{
  const whoToWhatIdx = instantBanSrc.indexOf('const completeWhoToWhat');
  const whoToWhatEnd = instantBanSrc.indexOf(
    'const completeWhatToWho',
    whoToWhatIdx,
  );
  const body = instantBanSrc.slice(whoToWhatIdx, whoToWhatEnd);
  assert.match(
    body,
    /setPhase\('composingBan', 'notification-owner-what-projection'\)/,
  );
  assert.doesNotMatch(body, /setPhase\('idle'/);
  assert.doesNotMatch(body, /RESET_TO_LOBBY/);
  pass('WHO → WHAT preserves composingBan');
}

// 12c. Owner WHAT keeps WhatScreen paint path
{
  const plan = planBootLobbyVisuals({
    kind: 'WHAT',
    mode: 'composing-ban',
  });
  assert.equal(plan.ownerWhatActive, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.match(instantBanSrc, /phase === 'composingBan'/);
  assert.match(instantBanSrc, /WhatScreen|WhatOverlay|showCrossScreenPager/);
  pass('Legacy WHAT remains visible after owner leaves WHO');
}

// 12d. WHAT → WHO returns to WHO from WHAT
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
  assert.equal(
    getNotificationOwnerBootLobbyState().presentation.kind,
    'WHAT',
  );
  const reopen = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'OPEN_WHO' },
  );
  assert.equal(reopen.rejected, null);
  assert.equal(reopen.state.presentation.kind, 'WHO');
  assert.match(instantBanSrc, /const completeWhatToWho/);
  {
    const idx = instantBanSrc.indexOf('const completeWhatToWho');
    const end = instantBanSrc.indexOf('const shouldCompleteWhoToWhat', idx);
    const body = instantBanSrc.slice(idx, end);
    assert.match(body, /type:\s*'OPEN_WHO'/);
  }
  pass('WHAT → WHO returns to WHO');
}

// 12e. Explicit legacy/WHAT reset returns to LOBBY
{
  toLobby();
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHO' });
  dispatchNotificationOwnerBootLobby({ type: 'OPEN_WHAT' });
  const reset = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'RESET_TO_LOBBY' },
  );
  assert.equal(reset.rejected, null);
  assert.equal(reset.state.presentation.kind, 'LOBBY');
  assert.match(instantBanSrc, /kind !== 'LEGACY_FLOW'/);
  assert.match(instantBanSrc, /kind !== 'WHAT'/);
  pass('Explicit legacy reset returns to LOBBY');
}

// 13. Incoming notification hosts unchanged while WHO is active
assert.match(providersSrc, /<GlobalOverlayHost/);
assert.match(providersSrc, /<NotificationQueueShell/);
assert.doesNotMatch(instantBanSrc, /NotificationQueueShell/);
pass('Incoming notification behaviour wiring unchanged while WHO is active');

// 14. Existing BOOT/LOBBY contract still holds
{
  resetNotificationOwnerBootLobbyStoreForTests();
  assert.equal(
    createInitialNotificationOwnerBootLobbyState().presentation.kind,
    'BOOT',
  );
  const bootDone = reduceNotificationOwnerBootLobby(
    createInitialNotificationOwnerBootLobbyState(),
    { type: 'BOOT_COMPLETE' },
  );
  assert.equal(bootDone.state.presentation.kind, 'LOBBY');
  assert.match(pageSrc, /useNotificationOwnerBootLobbyBridge/);
  assert.match(pageSrc, /<LobbyBootLogoShell/);
  assert.match(pageSrc, /<InstantBanFlow\b/);
  assert.match(instantBanSrc, /ArenaLobbyIdle/);
  assert.match(whoSrc, /WhoOverlay|function WhoOverlay/);
  assert.equal(existsSync(join(ownerDir, 'presentation')), false);
  assert.doesNotMatch(pageSrc, /NotificationOwnerHost/);
  assert.doesNotMatch(pageSrc, /NotificationPresentation/);
  pass('Existing BOOT/LOBBY tests still pass (contract intact)');
}

console.log(`\n${passed} passed\n`);
