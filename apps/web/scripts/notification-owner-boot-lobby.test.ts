/**
 * BOOT/LOBBY ownership slice — reducer + visual plan + live-path contract.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-boot-lobby.test.ts
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
const ownerDir = join(root, 'src/notification-owner');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== BOOT/LOBBY OWNERSHIP SLICE ===\n');

// 1. Initial owner state is BOOT
{
  resetNotificationOwnerBootLobbyStoreForTests();
  const s = createInitialNotificationOwnerBootLobbyState();
  assert.equal(s.presentation.kind, 'BOOT');
  assert.equal(getNotificationOwnerBootLobbyState().presentation.kind, 'BOOT');
  pass('Initial owner state is BOOT');
}

// 2. BOOT_COMPLETE → LOBBY
{
  const initial = createInitialNotificationOwnerBootLobbyState();
  const result = reduceNotificationOwnerBootLobby(initial, {
    type: 'BOOT_COMPLETE',
  });
  assert.equal(result.rejected, null);
  assert.equal(result.state.presentation.kind, 'LOBBY');
  if (result.state.presentation.kind === 'LOBBY') {
    assert.equal(result.state.presentation.mode, 'full');
  }
  pass('BOOT_COMPLETE transitions to LOBBY');
}

// store dispatch
{
  resetNotificationOwnerBootLobbyStoreForTests();
  dispatchNotificationOwnerBootLobby({ type: 'BOOT_COMPLETE' });
  assert.equal(getNotificationOwnerBootLobbyState().presentation.kind, 'LOBBY');
  const again = reduceNotificationOwnerBootLobby(
    getNotificationOwnerBootLobbyState(),
    { type: 'BOOT_COMPLETE' },
  );
  assert.equal(again.rejected, 'already-lobby');
  pass('Store BOOT_COMPLETE is idempotent once LOBBY');
}

// Visual plan — BOOT
{
  const plan = planBootLobbyVisuals({
    kind: 'BOOT',
    surface: 'deliberate-boot',
  });
  assert.equal(plan.showLobbyBootLogoShell, true);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.showBottomNavWhenIntroComplete, false);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.ownerConfirmActive, false);
  assert.equal(plan.ownerSuccessActive, false);
  pass('Under BOOT, visual plan includes LobbyBootLogoShell path');
}

// Visual plan — LOBBY
{
  const plan = planBootLobbyVisuals({ kind: 'LOBBY', mode: 'full' });
  assert.equal(plan.showLobbyBootLogoShell, false);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.showBottomNavWhenIntroComplete, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.ownerConfirmActive, false);
  assert.equal(plan.ownerSuccessActive, false);
  pass('Under LOBBY, visual plan mounts InstantBanFlow when arena visible');
}

// Visual plan — WHO (shell same as LOBBY; InstantBanFlow paints WhoOverlay)
{
  const plan = planBootLobbyVisuals({
    kind: 'WHO',
    mode: 'selecting-target',
  });
  assert.equal(plan.showLobbyBootLogoShell, false);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.showBottomNavWhenIntroComplete, true);
  assert.equal(plan.ownerWhoActive, true);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.ownerConfirmActive, false);
  assert.equal(plan.ownerSuccessActive, false);
  pass('Under WHO, visual plan keeps InstantBanFlow path (no .np-* shell)');
}

// Visual plan — WHAT
{
  const plan = planBootLobbyVisuals({
    kind: 'WHAT',
    mode: 'composing-ban',
  });
  assert.equal(plan.showLobbyBootLogoShell, false);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, true);
  assert.equal(plan.ownerConfirmActive, false);
  assert.equal(plan.ownerSuccessActive, false);
  pass('Under WHAT, visual plan keeps InstantBanFlow path (no .np-* shell)');
}

// Visual plan — CONFIRM
{
  const plan = planBootLobbyVisuals({
    kind: 'CONFIRM',
    mode: 'confirming',
  });
  assert.equal(plan.showLobbyBootLogoShell, false);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.ownerConfirmActive, true);
  assert.equal(plan.ownerSuccessActive, false);
  pass('Under CONFIRM, visual plan keeps InstantBanFlow path (no .np-* shell)');
}

// Visual plan — SUCCESS (no legacy phase; InstantBanFlow SuccessOverlay path)
{
  const plan = planBootLobbyVisuals({
    kind: 'SUCCESS',
    mode: 'send-success',
  });
  assert.equal(plan.showLobbyBootLogoShell, false);
  assert.equal(plan.mountInstantBanFlowWhenArenaVisible, true);
  assert.equal(plan.ownerWhoActive, false);
  assert.equal(plan.ownerWhatActive, false);
  assert.equal(plan.ownerConfirmActive, false);
  assert.equal(plan.ownerSuccessActive, true);
  pass('Under SUCCESS, visual plan keeps InstantBanFlow path (no .np-* shell)');
}

const pageSrc = read(pagePath);
const providersSrc = read(providersPath);
const instantBanSrc = read(instantBanPath);

// Live page mounts LobbyBootLogoShell
assert.match(pageSrc, /import \{ LobbyBootLogoShell \}/);
assert.match(pageSrc, /<LobbyBootLogoShell/);
assert.match(pageSrc, /showLobbyBootLogoShell/);
pass('Under BOOT path, live page includes LobbyBootLogoShell');

// Live page mounts InstantBanFlow
assert.match(pageSrc, /import \{ InstantBanFlow \}/);
assert.match(pageSrc, /arenaVisible \?\s*\(\s*<InstantBanFlow\b/);
pass('Under LOBBY path, live page includes InstantBanFlow');
// InstantBanFlow still contains lobby chrome
assert.match(instantBanSrc, /ArenaLobbyIdle/);
assert.match(instantBanSrc, /ArenaLobbyOrb/);
assert.match(instantBanSrc, /ArenaLobbyTopNav/);
pass('Under LOBBY, InstantBanFlow still contains ArenaLobbyIdle / orb / top nav');

// No NotificationPresentation mount in live production paths
assert.doesNotMatch(pageSrc, /NotificationPresentation/);
assert.doesNotMatch(
  pageSrc,
  /from ['"]@\/notification-owner\/presentation/,
);
assert.equal(
  existsSync(join(ownerDir, 'presentation')),
  false,
  'presentation/ dir must not exist',
);
// Providers may mention the word in comments; must not import/mount the component
assert.doesNotMatch(
  providersSrc,
  /import\s*\{[^}]*NotificationPresentation/,
);
assert.doesNotMatch(providersSrc, /<NotificationPresentation\b/);
assert.doesNotMatch(
  providersSrc,
  /from ['"]@\/notification-owner\/presentation/,
);
pass('NotificationPresentation is not mounted');

// No .np-* surfaces in production page/providers/owner slice
assert.doesNotMatch(pageSrc, /\bnp-boot\b|\bnp-lobby|\bdata-np-surface/);
assert.doesNotMatch(providersSrc, /\bdata-np-surface\b/);
for (const f of [
  'boot-lobby.adapter.ts',
  'boot-lobby.types.ts',
  'boot-lobby.reducer.ts',
  'boot-lobby.store.ts',
  'index.ts',
]) {
  const src = read(join(ownerDir, f));
  assert.doesNotMatch(
    src,
    /data-np-surface|className=["']np-/,
    `${f} must not define .np-* surfaces`,
  );
}
pass('No .np-* surface is mounted');

// GlobalOverlayHost + NotificationQueueShell remain
assert.match(providersSrc, /GlobalOverlayHost/);
assert.match(providersSrc, /NotificationQueueShell/);
assert.match(providersSrc, /<GlobalOverlayHost/);
assert.match(providersSrc, /<NotificationQueueShell/);
pass('GlobalOverlayHost and NotificationQueueShell remain present');

// Gray-screen regression: arenaVisible + instant-ban-active must still mount InstantBanFlow
assert.match(pageSrc, /app-page--instant-ban-active/);
assert.match(pageSrc, /arenaVisible \? ' app-page--instant-ban-active'/);
assert.match(pageSrc, /arenaVisible \?\s*\(\s*<InstantBanFlow\b/);
// Must not be a stub host
assert.doesNotMatch(pageSrc, /NotificationOwnerHost/);
assert.doesNotMatch(pageSrc, /data-notification-owner-host/);
pass(
  'Regression: app-page--instant-ban-active keeps InstantBanFlow as production arena root',
);

// Owner is wired as state bridge only
assert.match(pageSrc, /useNotificationOwnerBootLobbyBridge/);
pass('Page uses thin BOOT/LOBBY owner bridge (not a paint host)');

console.log(`\n${passed} passed\n`);
