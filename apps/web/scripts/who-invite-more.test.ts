/**
 * WHO “+ кому ещё запретишь” — native picker (production) + share fallback.
 *
 * Product: button launches native Telegram request_users picker when supported;
 * otherwise bot keyboard / invite share last resort. No @username sheet.
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

console.log('\n=== WHO INVITE MORE / NATIVE PICKER ===\n');

const whoSrc = read(whoPath);
const flowSrc = read(flowPath);
const cssSrc = read(cssPath);
const shareSrc = read(sharePath);
const gestureSrc = read(gesturePath);

{
  assert.match(whoSrc, /data-who-invite-more/);
  assert.match(whoSrc, /onInviteMore\(\)/);
  assert.match(whoSrc, /Кому ещё запретишь\?/);
  assert.match(flowSrc, /onInviteMore=\{handleInviteMore\}/);
  assert.match(flowSrc, /\/friends\/first-contact\/begin/);
  assert.match(flowSrc, /requestChat\(/);
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('// Native picker resolution'),
  );
  assert.doesNotMatch(inviteBlock, /if \(screenTransitionRef\.current\) return/);
  assert.doesNotMatch(inviteBlock, /if \(notificationChainTransitioning\)/);
  assert.doesNotMatch(inviteBlock, /if \(phase !==/);
  pass(
    'WHO + launches native picker begin/requestChat (no early return guards)',
  );
}

{
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('// Native picker resolution'),
  );
  assert.doesNotMatch(inviteBlock, /setSelectedUser\(null\)/);
  assert.doesNotMatch(inviteBlock, /setSelectedUser\(/);
  pass('Existing recipient remains selected (handler does not clear)');
}

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
  pass('Friend select unchanged; share helper kept for unregistered/fallback');
}

{
  assert.match(flowSrc, /completeWhatToWho/);
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('// Native picker resolution'),
  );
  assert.doesNotMatch(inviteBlock, /screenTransitionRef\.current\) return/);
  assert.match(whoSrc, /data-gesture-exclude/);
  assert.match(gestureSrc, /GESTURE_EXCLUDE_SELECTOR/);
  pass('Invite works after returning from WHAT (no transition gate)');
}

{
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('// Native picker resolution'),
  );
  assert.doesNotMatch(inviteBlock, /if \(phase !== 'selectingTarget'\)/);
  assert.doesNotMatch(inviteBlock, /confirmActive/);
  pass('Invite works after returning from CONFIRM');
}

{
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('// Native picker resolution'),
  );
  assert.doesNotMatch(
    inviteBlock,
    /if \(notificationChainTransitioning\)\s*return/,
  );
  assert.doesNotMatch(inviteBlock, /startupHold/);
  assert.doesNotMatch(inviteBlock, /overlayInputLocked/);
  pass('NotificationOwner transitions do not block invite');
}

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

{
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  assert.match(flowSrc, /botPickStartUrl/);
  assert.match(flowSrc, /request_mode: 'share_fallback'/);
  pass('Fallbacks: bot keyboard + invite/share last resort');
}

{
  assert.match(flowSrc, /setWhoInviteToast\(/);
  assert.match(flowSrc, /Не удалось открыть приглашение/);
  assert.match(flowSrc, /Ссылка скопирована/);
  assert.match(flowSrc, /data-who-invite-toast/);
  assert.doesNotMatch(flowSrc, /WhoFirstContactSheet/);
  pass('Share fallback visible; username sheet absent');
}

{
  assert.match(shareSrc, /export function shareInstantBanInviteMore/);
  assert.match(shareSrc, /export function openTelegramShareLink/);
  assert.match(shareSrc, /export type WhoInviteMoreDiag/);
  pass('shareInstantBanInviteMore / openTelegramShareLink exported');
}

console.log(`\n=== ${passed} passed ===\n`);
