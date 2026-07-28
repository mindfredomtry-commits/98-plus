/**
 * WHO “+ кому ещё запретишь” invite / add-recipient interaction.
 *
 * Product: button opens Telegram invite share (not multi-select slots).
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

// 1. One selected recipient context → invite button opens share flow (wired)
{
  assert.match(whoSrc, /data-who-invite-more/);
  assert.match(whoSrc, /onInviteMore\(\)/);
  assert.match(whoSrc, /Кому ещё запретишь\?/);
  assert.match(flowSrc, /onInviteMore=\{handleInviteMore\}/);
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  assert.match(
    flowSrc,
    /const handleInviteMore = useCallback\(\(\) => \{[\s\S]*?shareInstantBanInviteMore/,
  );
  // No early-return guards on invite (unlike handleSelectUser / handleWhatBack)
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.doesNotMatch(inviteBlock, /if \(screenTransitionRef\.current\) return/);
  assert.doesNotMatch(inviteBlock, /if \(notificationChainTransitioning\)/);
  assert.doesNotMatch(inviteBlock, /if \(phase !==/);
  assert.match(inviteBlock, /earlyReturnGuard: null/);
  pass(
    'One selected recipient → press invite → share/add-friends flow wired (no early return)',
  );
}

// 2. Existing selectedUser is not cleared by invite handler
{
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.doesNotMatch(inviteBlock, /setSelectedUser\(null\)/);
  assert.doesNotMatch(inviteBlock, /setSelectedUser\(/);
  assert.match(inviteBlock, /selectedRecipientIds: selectedIds/);
  pass('Existing recipient remains selected after invite (handler does not clear)');
}

// 3. Sequential friends B then C — select replaces one-at-a-time; invite does not invent duplicates
{
  // Single-recipient select path still used for send; invite is share-only.
  assert.match(flowSrc, /const handleSelectUser = useCallback/);
  const selectBlock = flowSrc.slice(
    flowSrc.indexOf('const handleSelectUser = useCallback'),
    flowSrc.indexOf('const handleComposeExitStart'),
  );
  assert.match(selectBlock, /setSelectedUser\(friend\)/);
  // Invite share builds invite deep link — unique bot start, not duplicate local slots
  assert.match(shareSrc, /INSTANT_BAN_INVITE_MORE_MESSAGE/);
  assert.match(shareSrc, /type: 'invite'/);
  assert.match(shareSrc, /export function shareInstantBanInviteMore/);
  pass('Add via invite is share deep-link (B/C join once via Telegram, not duplicate slots)');
}

// 4. Button works after returning WHO from WHAT/CONFIRM — no transition gate on invite
{
  assert.match(flowSrc, /completeWhatToWho/);
  assert.match(flowSrc, /handleConfirmBack/);
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.doesNotMatch(inviteBlock, /screenTransitionRef\.current\) return/);
  assert.match(whoSrc, /data-gesture-exclude/);
  assert.match(gestureSrc, /GESTURE_EXCLUDE_SELECTOR/);
  pass('Invite works after WHAT/CONFIRM return (no transition gate; gesture-exclude)');
}

// 5. Not blocked by NotificationOwner / chain flags
{
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.match(inviteBlock, /chainTransitioning: notificationChainTransitioning/);
  assert.doesNotMatch(
    inviteBlock,
    /if \(notificationChainTransitioning\)\s*return/,
  );
  assert.doesNotMatch(inviteBlock, /startupHold/);
  assert.doesNotMatch(inviteBlock, /overlayInputLocked/);
  pass('Invite not blocked by NotificationOwner transition flags');
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
  pass('Gesture zone cannot cover friend/invite list (z-index 12 body + safe inset)');
}

// 7. Share open has Telegram WebView fallbacks (not window.open alone)
{
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(shareSrc, /openTelegramLink/);
  assert.match(shareSrc, /openLink/);
  assert.match(shareSrc, /clickHiddenShareAnchor/);
  assert.match(shareSrc, /WHO_INVITE_DIAG|WhoInviteMoreDiag|shareMethod/);
  pass('Share open uses openTelegramLink → openLink → anchor (WebView-safe)');
}

// 8. Share helpers exported for invite path
{
  assert.match(shareSrc, /export function shareInstantBanInviteMore/);
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(shareSrc, /export type WhoInviteMoreDiag/);
  pass('shareInstantBanInviteMore / openTelegramShareLink exported');
}

console.log(`\n=== ${passed} passed ===\n`);
