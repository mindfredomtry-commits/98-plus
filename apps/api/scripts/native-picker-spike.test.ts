/**
 * SPIKE — native picker contract tests (no Telegram / Redis).
 *
 * Run:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/native-picker-spike.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeUsersSharedPayload } from '../src/services/native-picker-spike-parse';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== NATIVE PICKER SPIKE ===\n');

{
  const n = normalizeUsersSharedPayload({
    request_id: 42,
    users: [
      {
        user_id: 999001,
        first_name: 'Ada',
        last_name: 'Lovelace',
        username: 'ada',
        photo: [{ file_id: 'x' }],
      },
    ],
  });
  assert.ok(n);
  assert.equal(n.request_id, 42);
  assert.equal(n.users[0]?.user_id, 999001);
  assert.equal(n.users[0]?.username, 'ada');
  assert.ok(Array.isArray(n.users[0]?.photo));
  pass('normalizeUsersSharedPayload with username + photo');
}

{
  const n = normalizeUsersSharedPayload({
    request_id: 7,
    users: [{ user_id: '555', first_name: 'NoUser' }],
  });
  assert.ok(n);
  assert.equal(n.users[0]?.user_id, '555');
  assert.equal(n.users[0]?.username, null);
  pass('normalizeUsersSharedPayload without public username');
}

{
  assert.equal(normalizeUsersSharedPayload(null), null);
  assert.equal(normalizeUsersSharedPayload({ users: [] }), null);
  pass('normalizeUsersSharedPayload rejects bad payloads');
}

{
  const svc = read('src/services/native-picker-spike.service.ts');
  const route = read('src/routes/spike-native-picker.ts');
  const bot = read('src/bot/index.ts');
  assert.match(svc, /savePreparedKeyboardButton/);
  assert.match(svc, /request_users/);
  assert.match(svc, /max_quantity:\s*1/);
  assert.match(svc, /user_is_bot:\s*false/);
  assert.match(svc, /request_name:\s*true/);
  assert.match(svc, /request_username:\s*true/);
  assert.match(svc, /request_photo:\s*true/);
  assert.doesNotMatch(svc, /recordSocialContact|BanInvite|OPEN_WHAT/);
  assert.match(route, /spikeNativePickerRouter\.post\('\/begin'/);
  assert.match(read('src/app.ts'), /\/spike\/native-picker/);
  assert.match(bot, /users_shared/);
  assert.match(bot, /handleUsersSharedSpike/);
  pass('contract: Bot API prepare + users_shared; no SocialContact/WHAT/invite');
}

{
  const web = readFileSync(
    join(root, '../../apps/web/src/components/spike/SpikeNativePickerPanel.tsx'),
    'utf8',
  );
  assert.match(web, /requestChat/);
  assert.match(web, /SELECTED/);
  assert.match(web, /registeredInApp/);
  assert.match(web, /typeof=/);
  pass('Mini App spike UI calls requestChat and shows SELECTED / registered');
}

console.log(`\n${passed} passed\n`);
