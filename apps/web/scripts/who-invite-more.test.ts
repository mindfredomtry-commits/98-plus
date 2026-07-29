/**
 * WHO “+ кому ещё запретишь” → prepare-first anonymous WHAT flow.
 *
 * Product: tap opens WHAT immediately with KNOWN_BY_SENDER recipient mode.
 * Telegram Share opens only after SUCCESS “выбрать человека”.
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
const whatPath = join(root, 'src/components/instant-ban/WhatScreen.tsx');
const confirmPath = join(root, 'src/components/instant-ban/ConfirmScreen.tsx');
const successPath = join(root, 'src/components/instant-ban/SuccessScreen.tsx');
const successBodyPath = join(
  root,
  'src/components/instant-ban/SuccessBanCardBody.tsx',
);
const cssPath = join(root, 'src/components/instant-ban/instant-ban.css');
const sharePath = join(root, 'src/lib/share.ts');
const constantsPath = join(
  root,
  '../../packages/shared/src/constants.ts',
);

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== PREPARE-FIRST WHO INVITE MORE ===\n');

const whoSrc = read(whoPath);
const flowSrc = read(flowPath);
const whatSrc = read(whatPath);
const confirmSrc = read(confirmPath);
const successSrc = read(successPath);
const successBodySrc = read(successBodyPath);
const cssSrc = read(cssPath);
const shareSrc = read(sharePath);
const constantsSrc = read(constantsPath);

const inviteBlock = flowSrc.slice(
  flowSrc.indexOf('const handleInviteMore = useCallback'),
  flowSrc.indexOf('const handleShareInviteMore'),
);

// 1. WHO “+ кому ещё запретишь” → opens WHAT immediately
{
  assert.match(whoSrc, /data-who-invite-more/);
  assert.match(whoSrc, /onInviteMore\(\)/);
  assert.match(whoSrc, /Кому ещё запретишь\?/);
  assert.match(flowSrc, /onInviteMore=\{handleInviteMore\}/);
  assert.match(
    inviteBlock,
    /COMPOSE_RECIPIENT_MODES\.KNOWN_BY_SENDER/,
  );
  assert.match(inviteBlock, /animateCrossScreenProgress\(1, completeWhoToWhat\)/);
  assert.match(constantsSrc, /KNOWN_BY_SENDER:\s*'KNOWN_BY_SENDER'/);
  pass('WHO “+ кому ещё запретишь” → opens WHAT immediately');
}

// 2. Anonymous WHAT displays empty avatar + label
{
  assert.match(whatSrc, /data-recipient-mode=\{recipientMode\}/);
  assert.match(whatSrc, /ты уже знаешь кто это/);
  assert.match(
    whatSrc,
    /KNOWN_BY_SENDER[\s\S]*?src=\{null\}[\s\S]*?letter=""/,
  );
  assert.match(
    whatSrc,
    /recipientValid\s*=\s*[\s\S]*KNOWN_BY_SENDER[\s\S]*selectedUser\s*!=\s*null/,
  );
  assert.match(
    whatSrc,
    /showSwipeHint\s*=[\s\S]*canSwipeToConfirm\s*&&\s*recipientValid/,
  );
  pass('Anonymous WHAT: empty avatar + “ты уже знаешь кто это”');
}

// 3. Does not open Telegram Share from WHO
{
  assert.doesNotMatch(inviteBlock, /shareInstantBanInviteMore/);
  assert.doesNotMatch(inviteBlock, /handleShareChallenge/);
  assert.doesNotMatch(inviteBlock, /openTelegramShareLink/);
  pass('Does not open Telegram Share from WHO');
}

// 4–5. No SocialContact / no direct recipient ban from this CTA
{
  assert.match(
    inviteBlock,
    /setRecipientMode\(COMPOSE_RECIPIENT_MODES\.KNOWN_BY_SENDER\)/,
  );
  assert.match(inviteBlock, /setSelectedUser\(null\)/);
  assert.doesNotMatch(inviteBlock, /recordSocialContact|\/friends\/touch/);
  assert.doesNotMatch(inviteBlock, /\/bans\/send/);
  pass('CTA does not create SocialContact or direct recipient ban');
}

// 6. WHAT → CONFIRM preserves anonymous recipient mode
{
  assert.match(
    flowSrc,
    /sendSnapshotRef\.current = \{[\s\S]*?recipientMode,/,
  );
  const confirmBack = flowSrc.slice(
    flowSrc.indexOf('const handleConfirmBack = useCallback'),
    flowSrc.indexOf('const handleInviteMore = useCallback'),
  );
  // Send-flow CONFIRM → WHAT keeps mode; bans-overlay abort clears (cancel).
  assert.match(
    confirmBack,
    /OPEN_WHAT[\s\S]*?setPhase\('composingBan'/,
  );
  const sendFlowReturn = confirmBack.slice(
    confirmBack.indexOf('leaveWhoForLegacyRef.current = false'),
  );
  assert.doesNotMatch(
    sendFlowReturn,
    /setRecipientMode\(COMPOSE_RECIPIENT_MODES\.DIRECT\)/,
  );
  assert.match(confirmSrc, /recipientMode: ComposeRecipientMode/);
  assert.match(confirmSrc, /ты уже знаешь кто это/);
  pass('WHAT → CONFIRM preserves anonymous recipient mode');
}

// 7. Successful hold creates one prepared invite-ban
{
  assert.match(
    flowSrc,
    /recipientMode: COMPOSE_RECIPIENT_MODES\.KNOWN_BY_SENDER/,
  );
  assert.match(flowSrc, /clientRequestId/);
  assert.match(flowSrc, /preparedInviteInFlightRef/);
  assert.match(
    flowSrc,
    /if \(snap\.preparedInvite\?\.shareUrl\)/,
  );
  pass('Hold creates one prepared invite-ban (clientRequestId + in-flight)');
}

// 8–9. Anonymous SUCCESS copy + buttons
{
  assert.match(successBodySrc, /запрет готов/);
  assert.match(successSrc, /выбрать человека/);
  assert.match(
    successSrc,
    /KNOWN_BY_SENDER[\s\S]*?выбрать человека[\s\S]*?Запретить ещё!/,
  );
  const knownBranch = successSrc.slice(
    successSrc.indexOf('const knownBySender'),
  );
  assert.match(knownBranch, /выбрать человека/);
  assert.doesNotMatch(
    knownBranch.slice(0, knownBranch.indexOf('Готово') + 20),
    />\s*Запретить ещё!/,
  );
  pass('Anonymous SUCCESS: “запрет готов” + “выбрать человека”');
}

// 10–11. Share only after CTA; double-tap guarded
{
  assert.match(
    flowSrc,
    /handlePreparedInviteChoosePerson[\s\S]*?handleShareChallenge/,
  );
  assert.match(successSrc, /shareActionRef/);
  assert.match(
    successSrc,
    /if \(shareActionRef\.current\) return/,
  );
  assert.match(
    flowSrc,
    /successSnapshot\.recipientMode ===[\s\S]*KNOWN_BY_SENDER[\s\S]*handlePreparedInviteChoosePerson/,
  );
  pass('Share opens only after “выбрать человека”; double-tap guarded');
}

// 12. Normal registered SUCCESS unchanged
{
  assert.match(successBodySrc, /Запрет отправлен/);
  assert.match(successSrc, /Запретить ещё!/);
  assert.match(successSrc, /Поделиться/);
  assert.match(
    flowSrc,
    /COMPOSE_RECIPIENT_MODES\.KNOWN_BY_SENDER[\s\S]*handlePreparedInviteChoosePerson[\s\S]*handleShareInviteMore/,
  );
  pass('Normal registered-recipient SUCCESS remains unchanged');
}

// 13–14. Cancel clears mode; later normal ban does not inherit
{
  assert.match(
    flowSrc,
    /finishWhoDismiss[\s\S]*?setRecipientMode\(COMPOSE_RECIPIENT_MODES\.DIRECT\)/,
  );
  assert.match(
    flowSrc,
    /handleSelectUser[\s\S]*?setRecipientMode\(COMPOSE_RECIPIENT_MODES\.DIRECT\)/,
  );
  assert.match(
    flowSrc,
    /resetSendUiForBansCta[\s\S]*?setRecipientMode\(COMPOSE_RECIPIENT_MODES\.DIRECT\)/,
  );
  pass('Cancel/reset/select friend clears anonymous recipient mode');
}

// Gesture stacking still intact for WHO invite row
{
  assert.match(
    cssSrc,
    /\.instant-ban-who-screen-layer__body[\s\S]*?z-index:\s*12/,
  );
  assert.match(shareSrc, /export function handleShareChallenge/);
  pass('WHO invite stacking + share helper still available');
}

console.log(`\n=== ${passed} passed ===\n`);
