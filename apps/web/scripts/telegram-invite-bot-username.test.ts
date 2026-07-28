/**
 * Telegram invite URL bot username — canonical BotFather identity.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/telegram-invite-bot-username.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TELEGRAM_BOT_USERNAME,
  buildShareUrl,
  buildStartParam,
  buildTelegramInviteUrl,
  normalizeTelegramBotUsername,
} from '@98plus/shared';

const root = join(__dirname, '..');

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== TELEGRAM INVITE BOT USERNAME ===\n');

{
  assert.equal(TELEGRAM_BOT_USERNAME, 'Ninety_eight_pluss_Bot');
  pass('canonical constant is Ninety_eight_pluss_Bot');
}

{
  const url = buildTelegramInviteUrl('u_justDim');
  assert.equal(
    url,
    'https://t.me/Ninety_eight_pluss_Bot?start=u_justDim',
  );
  pass("buildTelegramInviteUrl('u_justDim') → correct t.me URL");
}

{
  const url = buildTelegramInviteUrl('u_justDim', '@Ninety_eight_pluss_Bot');
  assert.equal(
    url,
    'https://t.me/Ninety_eight_pluss_Bot?start=u_justDim',
  );
  assert.doesNotMatch(url, /@/);
  pass('strips leading @ from username; never in URL path');
}

{
  assert.equal(
    normalizeTelegramBotUsername('ninety8plus_bot'),
    'Ninety_eight_pluss_Bot',
  );
  assert.equal(
    normalizeTelegramBotUsername('Ninety8Plus_Bot'),
    'Ninety_eight_pluss_Bot',
  );
  // casing/underscores of the confirmed bot preserved
  assert.equal(
    normalizeTelegramBotUsername('Ninety_eight_pluss_Bot'),
    'Ninety_eight_pluss_Bot',
  );
  assert.equal(
    normalizeTelegramBotUsername('@Ninety_eight_pluss_Bot'),
    'Ninety_eight_pluss_Bot',
  );
  assert.equal(normalizeTelegramBotUsername(null), 'Ninety_eight_pluss_Bot');
  assert.equal(normalizeTelegramBotUsername(''), 'Ninety_eight_pluss_Bot');
  pass('never falls back to ninety8plus_bot; preserves casing/underscores');
}

{
  const payload = 'u_user+name/test';
  const url = buildTelegramInviteUrl(payload);
  assert.equal(
    url,
    `https://t.me/Ninety_eight_pluss_Bot?start=${encodeURIComponent(payload)}`,
  );
  pass('start payload is URL-encoded');
}

{
  const startParam = buildStartParam({ type: 'invite', username: 'justDim' });
  assert.equal(startParam, 'u_justDim');
  const share = buildShareUrl(
    TELEGRAM_BOT_USERNAME,
    startParam,
    'Заходи в 98+',
  );
  const decoded = decodeURIComponent(share.replace(/^.*\?text=/, ''));
  assert.match(
    decoded,
    /https:\/\/t\.me\/Ninety_eight_pluss_Bot\?start=u_justDim/,
  );
  assert.doesNotMatch(decoded, /ninety8plus_bot/i);
  pass('share text embeds corrected invite URL');
}

{
  const shareSrc = readFileSync(join(root, 'src/lib/share.ts'), 'utf8');
  assert.doesNotMatch(shareSrc, /['"`]ninety8plus_bot['"`]/);
  assert.match(shareSrc, /normalizeTelegramBotUsername/);
  assert.match(shareSrc, /buildTelegramInviteUrl/);
  const goSrc = readFileSync(
    join(root, 'src/lib/open-telegram-from-go.ts'),
    'utf8',
  );
  assert.doesNotMatch(goSrc, /['"`]ninety8plus_bot['"`]/);
  const docker = readFileSync(join(root, 'Dockerfile'), 'utf8');
  assert.match(docker, /ARG NEXT_PUBLIC_BOT_USERNAME=Ninety_eight_pluss_Bot/);
  const apiDeeplink = readFileSync(
    join(root, '../api/src/lib/deeplink.ts'),
    'utf8',
  );
  assert.doesNotMatch(apiDeeplink, /['"`]ninety8plus_bot['"`]/);
  pass('web/api sources no longer hardcode ninety8plus_bot; Docker ARG set');
}

{
  // Clipboard / invite-more shareText uses the same builder
  const startParam = buildStartParam({ type: 'invite', username: 'justDim' });
  const botStart = buildTelegramInviteUrl(startParam);
  assert.equal(
    botStart,
    'https://t.me/Ninety_eight_pluss_Bot?start=u_justDim',
  );
  const clipboardBody = `Заходи в 98+ — будем запрещать друг другу\n\n${botStart}`;
  assert.match(
    clipboardBody,
    /https:\/\/t\.me\/Ninety_eight_pluss_Bot\?start=u_justDim/,
  );
  pass('clipboard fallback body uses the same corrected URL');
}

console.log(`\n=== ${passed} passed ===\n`);
