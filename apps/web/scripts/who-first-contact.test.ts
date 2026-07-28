/**
 * WHO first-contact v1 — frontend wiring.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/who-first-contact.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHO FIRST-CONTACT UI ===\n');

const flowSrc = read('src/components/instant-ban/InstantBanFlow.tsx');
const sheetSrc = read('src/components/instant-ban/WhoFirstContactSheet.tsx');
const whoSrc = read('src/components/instant-ban/WhoScreen.tsx');
const providersSrc = read('src/components/Providers.tsx');

// 1. "+" opens sheet (not direct share)
{
  assert.match(flowSrc, /setFirstContactOpen\(true\)/);
  assert.match(
    flowSrc,
    /const handleInviteMore = useCallback\(\(\) => \{[\s\S]*?setFirstContactOpen\(true\)/,
  );
  const inviteBlock = flowSrc.slice(
    flowSrc.indexOf('const handleInviteMore = useCallback'),
    flowSrc.indexOf('const handleFirstContactClose'),
  );
  assert.doesNotMatch(inviteBlock, /shareInstantBanInviteMore\(/);
  assert.match(flowSrc, /WhoFirstContactSheet/);
  assert.match(sheetSrc, /data-who-first-contact-sheet/);
  assert.match(sheetSrc, /data-who-first-contact-input/);
  assert.match(sheetSrc, /data-who-first-contact-submit/);
  assert.match(sheetSrc, /Пригласить в Telegram/);
  pass('Invite button opens first-contact sheet with username + share CTA');
}

// 2. Registered → upsertFriend + handleSelectUser (OPEN_WHAT path)
{
  const submitBlock = flowSrc.slice(
    flowSrc.indexOf('const handleFirstContactSubmit = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.match(submitBlock, /\/friends\/first-contact/);
  assert.match(submitBlock, /upsertFriend\(friend\)/);
  assert.match(submitBlock, /handleSelectUser\(friend\)/);
  assert.match(submitBlock, /firstContactWhatLockRef/);
  assert.match(submitBlock, /WHO_FIRST_CONTACT_REGISTERED/);
  assert.match(submitBlock, /WHO_FIRST_CONTACT_WHAT_OPENED/);
  assert.doesNotMatch(submitBlock, /createPendingInvite|INVITE_PENDING/);
  pass('Registered path merges friend and uses handleSelectUser (WHAT)');
}

// 3. Unregistered → invite note + share fallback, no WHAT
{
  const submitBlock = flowSrc.slice(
    flowSrc.indexOf('const handleFirstContactSubmit = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.match(submitBlock, /setFirstContactInviteUsername/);
  assert.match(submitBlock, /WHO_FIRST_CONTACT_UNREGISTERED/);
  assert.doesNotMatch(
    submitBlock.slice(
      submitBlock.indexOf("status === 'unregistered'"),
      submitBlock.indexOf("status === 'unregistered'") + 400,
    ),
    /handleSelectUser/,
  );
  assert.match(flowSrc, /handleFirstContactShare/);
  assert.match(flowSrc, /runWhoInviteShare/);
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  pass('Unregistered stays on sheet; share fallback still wired');
}

// 4. Errors stay on sheet — no WHAT
{
  const submitBlock = flowSrc.slice(
    flowSrc.indexOf('const handleFirstContactSubmit = useCallback'),
    flowSrc.indexOf('const handleSendContextChange'),
  );
  assert.match(submitBlock, /setFirstContactError/);
  assert.match(submitBlock, /rate_limited|429/);
  assert.match(submitBlock, /invalid_username|self/);
  assert.match(submitBlock, /WHO_FIRST_CONTACT_FAIL/);
  pass('Error / rate-limit / self / invalid handled inline');
}

// 5. Duplicate submit lock
{
  assert.match(flowSrc, /firstContactWhatLockRef\.current = true/);
  assert.match(
    flowSrc,
    /if \(firstContactBusy \|\| firstContactWhatLockRef\.current\) return/,
  );
  pass('Duplicate submit cannot open WHAT twice');
}

// 6. Existing WHO friend tap unchanged
{
  assert.match(whoSrc, /onClick=\{\(\) => onSelect\(display\.friend\)\}/);
  assert.match(flowSrc, /onSelect=\{handleSelectUser\}/);
  const selectBlock = flowSrc.slice(
    flowSrc.indexOf('const handleSelectUser = useCallback'),
    flowSrc.indexOf('const handleComposeExitStart'),
  );
  assert.match(selectBlock, /screenTransitionRef\.current = 'whoToWhat'/);
  assert.match(selectBlock, /animateCrossScreenProgress\(1, completeWhoToWhat\)/);
  pass('Existing WHO friend tap still uses handleSelectUser → WHAT');
}

// 7. upsertFriend on AppContext
{
  assert.match(providersSrc, /upsertFriend:\s*\(card: FriendCard\)\s*=>\s*void/);
  assert.match(providersSrc, /const upsertFriend = useCallback/);
  assert.match(providersSrc, /via:\s*'upsertFriend'/);
  pass('Providers upsertFriend merges into friends state');
}

// 8. Invite/share path still present for fallback
{
  assert.match(flowSrc, /shareInstantBanInviteMore\(/);
  assert.match(flowSrc, /WHO_FIRST_CONTACT_INVITE_SHARE/);
  pass('Existing invite/share path still works as unregistered fallback');
}

console.log(`\n${passed} passed\n`);
