/**
 * WHO native picker production flow — path / wiring tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/who-native-picker.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  supportsNativeRequestChat,
  type TelegramWebAppPicker,
} from '../src/lib/who-native-picker';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

console.log('\n=== WHO NATIVE PICKER (WEB) ===\n');

{
  assert.equal(
    supportsNativeRequestChat({
      requestChat: () => {},
      isVersionAtLeast: (v) => v === '9.6',
    } as TelegramWebAppPicker),
    true,
  );
  assert.equal(
    supportsNativeRequestChat({
      requestChat: () => {},
      isVersionAtLeast: () => false,
    } as TelegramWebAppPicker),
    false,
  );
  assert.equal(supportsNativeRequestChat({} as TelegramWebAppPicker), false);
  pass('supportsNativeRequestChat gates on requestChat + 9.6');
}

const flow = read('src/components/instant-ban/InstantBanFlow.tsx');
const who = read('src/components/instant-ban/WhoScreen.tsx');
const providers = read('src/components/Providers.tsx');
const sharedConstants = readFileSync(
  join(__dirname, '../../../packages/shared/src/constants.ts'),
  'utf8',
);
const deeplink = readFileSync(
  join(__dirname, '../../../packages/shared/src/deeplink.ts'),
  'utf8',
);

{
  assert.match(flow, /\/friends\/first-contact\/begin/);
  assert.match(flow, /requestChat\(/);
  assert.match(flow, /WHO_NATIVE_PICKER_STARTED/);
  assert.match(flow, /WHO_NATIVE_PICKER_OPENED/);
  assert.match(flow, /WHO_NATIVE_PICKER_CANCELLED/);
  assert.match(flow, /WHO_NATIVE_PICKER_REGISTERED/);
  assert.match(flow, /WHO_NATIVE_PICKER_UNREGISTERED/);
  assert.match(flow, /WHO_NATIVE_PICKER_WHAT_OPENED/);
  assert.match(flow, /WHO_NATIVE_PICKER_FAILED/);
  pass('InstantBanFlow: begin + requestChat + analytics events');
}

{
  assert.match(flow, /upsertFriend\(friend\)/);
  assert.match(flow, /handleSelectUser\(friend\)/);
  assert.doesNotMatch(flow, /WhoFirstContactSheet/);
  assert.doesNotMatch(flow, /firstContactOpen/);
  assert.doesNotMatch(flow, /SpikeNativePicker/);
  pass('Registered path: upsertFriend + handleSelectUser; no username sheet / spike');
}

{
  const inviteBlock = flow.slice(
    flow.indexOf('const handleInviteMore = useCallback'),
    flow.indexOf('// Native picker resolution'),
  );
  assert.match(inviteBlock, /first-contact\/begin/);
  assert.match(inviteBlock, /shareInstantBanInviteMore/);
  assert.match(inviteBlock, /botPickStartUrl/);
  assert.doesNotMatch(inviteBlock, /WhoFirstContactSheet/);
  pass('WHO + launches native picker with bot_keyboard + share fallbacks');
}

{
  const effectIdx = flow.indexOf('// Native picker resolution');
  const effectBlock = flow.slice(
    effectIdx,
    flow.indexOf('// Poll while picker pending'),
  );
  const unregStart = effectBlock.indexOf("result.status === 'unregistered'");
  const regStart = effectBlock.indexOf("result.status !== 'registered'");
  const unregBlock = effectBlock.slice(unregStart, regStart);
  assert.match(unregBlock, /shareInstantBanInviteMore/);
  assert.doesNotMatch(unregBlock, /handleSelectUser\(/);
  assert.doesNotMatch(unregBlock, /upsertFriend\(/);
  pass('Unregistered: invite share, no WHAT');
}

{
  assert.match(flow, /errorMessage === 'self'/);
  assert.match(flow, /Нельзя запретить самому себе/);
  pass('Self selection shows toast, stays on WHO');
}

{
  assert.match(flow, /ok === true\) return/);
  assert.match(flow, /WHO_NATIVE_PICKER_CANCELLED/);
  assert.match(flow, /\/cancel/);
  pass('Cancellation returns to WHO (cancel API, no invite)');
}

{
  assert.match(flow, /const handleSelectUser = useCallback/);
  assert.match(who, /onSelect/);
  assert.match(who, /onInviteMore/);
  pass('Existing WHO friend selection wiring unchanged');
}

{
  assert.match(providers, /upsertFriend/);
  assert.match(providers, /who:first-contact/);
  assert.match(providers, /who_first_contact/);
  assert.match(providers, /\/friends\/first-contact\/consume/);
  pass('Providers: upsertFriend + WS + consume deeplink');
}

{
  assert.match(sharedConstants, /who_native_picker_started/);
  assert.match(sharedConstants, /who_native_picker_what_opened/);
  assert.match(deeplink, /who_first_contact/);
  assert.match(deeplink, /wfc_/);
  pass('Shared analytics + wfc_ deeplink');
}

{
  assert.doesNotMatch(flow, /NEXT_PUBLIC_SPIKE_NATIVE_PICKER/);
  assert.doesNotMatch(providers, /SpikeNativePickerPanel/);
  pass('No spike panel in production UI');
}

console.log(`\n=== ${passed} passed ===\n`);
