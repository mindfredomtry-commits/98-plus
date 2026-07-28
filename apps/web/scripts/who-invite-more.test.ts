/**
 * WHO “+ кому ещё запретишь” invite / add-recipient interaction.
 *
 * Product (v1): button opens first-contact sheet; unregistered path still uses
 * Telegram invite share (not multi-select slots).
 * Pre-existing blocker: gesture zone z-index swallowed taps; share fell through
 * to window.open which WebView popup-blockers kill → “nothing happens”.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/who-invite-more.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const whoPath = join(root, 'src/components/instant-ban/WhoScreen.tsx');
const flowPath = join(root, 'src/components/instant-ban/InstantBanFlow.tsx');
const cssPath = join(root, 'src/components/instant-ban/instant-ban.css');
const sharePath = join(root, 'src/lib/share.ts');
const gesturePath = join(
  root,
  'src/components/instant-ban/gestureExclusion.ts',
);

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHO INVITE MORE / ADD-RECIPIENT ===\n');

const whoSrc = read(whoPath);
const flowSrc = read(flowPath);
const cssSrc = read(cssPath);
const shareSrc = read(sharePath);
const gestureSrc = read(gesturePath);

// 1. Invite button opens first-contact sheet; share remains as fallback
{
  assert.match(whoSrc, /data-who-invite-more/);
  assert.match(whoSrc, /onInviteMore\(\)/);
  assert.match(whoSrc, /Кому ещё запретишь\?/);
  assert.match(flowSrc, /onInviteMore=\{handleInviteMore\}/);
  assert.match(flowSrc, /setFirstContactOpen\(true\)/);
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  assert.match(flowSrc, /const runWhoInviteShare = useCallback/);
  // Opening the sheet has no early-return guards (unlike handleSelectUser)
  const openBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleFirstContactClose'),
  );
  assert.doesNotMatch(openBlock, /if \(screenTransitionRef\.current\) return/);
  assert.doesNotMatch(openBlock, /if \(notificationChainTransitioning\)/);
  assert.doesNotMatch(openBlock, /if \(phase !==/);
  pass(
    'Invite button opens first-contact sheet; share fallback still wired',
  );
}

// 2. Share fallback does not clear selectedUser
{
  const shareBlock = flowSrc.slice(
    flowSrc.indexOf('const runWhoInviteShare = useCallback'),
    flowSrc.indexOf('const handleInviteMore = useCallback'),
  );
  assert.doesNotMatch(shareBlock, /setSelectedUser\(null\)/);
  assert.doesNotMatch(shareBlock, /setSelectedUser\(/);
  assert.match(shareBlock, /selectedRecipientIds: selectedIds/);
  assert.match(shareBlock, /earlyReturnGuard: null/);
  pass('Existing recipient remains selected after invite share');
}

// 3. Sequential friends B then C — select replaces one-at-a-time; invite does not invent duplicates
{
  assert.match(flowSrc, /const handleSelectUser = useCallback/);
  const selectBlock = flowSrc.slice(
    flowSrc.indexOf('const handleSelectUser = useCallback'),
    flowSrc.indexOf('const handleComposeExitStart'),
  );
  assert.match(selectBlock, /setSelectedUser\(friend\)/);
  assert.match(shareSrc, /INSTANT_BAN_INVITE_MORE_MESSAGE/);
  assert.match(shareSrc, /type: 'invite'/);
  assert.match(shareSrc, /export function shareInstantBanInviteMore/);
  pass('Add via invite is share deep-link (B/C join once via Telegram, not duplicate slots)');
}

// 4. Sheet open works after returning WHO from WHAT — no transition gate on open
{
  assert.match(flowSrc, /completeWhatToWho/);
  const openBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleFirstContactClose'),
  );
  assert.doesNotMatch(openBlock, /screenTransitionRef\.current\) return/);
  assert.match(whoSrc, /data-gesture-exclude/);
  assert.match(gestureSrc, /GESTURE_EXCLUDE_SELECTOR/);
  pass('Invite works after returning from WHAT (no transition gate on sheet open)');
}

// 4b. Button works after returning from CONFIRM
{
  assert.match(flowSrc, /handleConfirmBack/);
  const openBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleFirstContactClose'),
  );
  assert.doesNotMatch(openBlock, /if \(phase !== 'selectingTarget'\)/);
  assert.doesNotMatch(openBlock, /confirmActive/);
  pass('Invite works after returning from CONFIRM');
}

// 5. Share fallback not blocked by NotificationOwner / chain flags
{
  const shareBlock = flowSrc.slice(
    flowSrc.indexOf('const runWhoInviteShare = useCallback'),
    flowSrc.indexOf('const handleInviteMore = useCallback'),
  );
  assert.match(shareBlock, /chainTransitioning: notificationChainTransitioning/);
  assert.doesNotMatch(
    shareBlock,
    /if \(notificationChainTransitioning\)\s*return/,
  );
  assert.doesNotMatch(shareBlock, /startupHold/);
  assert.doesNotMatch(shareBlock, /overlayInputLocked/);
  pass('NotificationOwner transitions do not block invite share');
}

// 6. Pointer / stacking fix — body above gesture zone; zone starts zero-height
{
  assert.match(
    cssSrc,
    /\.instant-ban-who-screen-layer__body\s*\{[^}]*z-index:\s*12/s,
  );
  assert.match(
    cssSrc,
    /\.instant-ban-who-dismiss-gesture-zone\s*\{[^}]*z-index:\s*11/s,
  );
  assert.match(
    whoSrc,
    /gestureZoneInsetBottom[\s\S]*?Math\.max\(window\.innerHeight,\s*1\)/,
  );
  assert.match(whoSrc, /onPointerDown=\{\(\) => logInvitePointer\('pointerdown'\)\}/);
  assert.match(whoSrc, /logInvitePointer\('click'\)/);
  pass('Click reaches invite handler (pointer/click diag + stacking)');
}

// 7. Handler calls invite/share + WebView fallbacks
{
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(shareSrc, /openTelegramLink/);
  assert.match(shareSrc, /openLink/);
  assert.match(shareSrc, /clickHiddenShareAnchor/);
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  pass('Handler calls invite/share; primary→fallback open path present');
}

// 8. Fallback executes if primary share fails + visible failure (never silent)
{
  assert.match(shareSrc, /finalOutcome: 'copied'/);
  assert.match(shareSrc, /finalOutcome: 'failed'/);
  assert.match(shareSrc, /copyFallback\(shareText\)/);
  assert.match(flowSrc, /setWhoInviteToast\(/);
  assert.match(flowSrc, /Не удалось открыть приглашение/);
  assert.match(flowSrc, /Ссылка скопирована/);
  assert.match(flowSrc, /data-who-invite-toast/);
  pass('Fallback executes if primary share fails; failure is visible');
}

// 9. Share helpers exported for invite path
{
  assert.match(shareSrc, /export function shareInstantBanInviteMore/);
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(shareSrc, /export type WhoInviteMoreDiag/);
  pass('shareInstantBanInviteMore / openTelegramShareLink exported');
}

console.log(`\n=== ${passed} passed ===\n`);
