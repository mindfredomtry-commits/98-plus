/**
 * SPIKE — web wiring for native picker diagnostic panel.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/native-picker-spike.test.ts
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

console.log('\n=== NATIVE PICKER SPIKE (WEB) ===\n');

const panel = read('src/components/spike/SpikeNativePickerPanel.tsx');
const settings = read('src/components/instant-ban/ArenaSettingsPanel.tsx');
const who = read('src/components/instant-ban/WhoScreen.tsx');
const flowInvite = read('src/components/instant-ban/InstantBanFlow.tsx');

{
  assert.match(panel, /Telegram\.WebApp\.requestChat|tg\.requestChat/);
  assert.match(panel, /\/spike\/native-picker\/begin/);
  assert.match(panel, /SELECTED/);
  assert.match(panel, /NEXT_PUBLIC_SPIKE_NATIVE_PICKER/);
  pass('Spike panel: begin + requestChat + SELECTED');
}

{
  assert.match(settings, /SpikeNativePickerPanel/);
  assert.match(settings, /isSpikeNativePickerEnabled/);
  pass('Settings hosts spike panel behind env gate');
}

{
  assert.doesNotMatch(who, /SpikeNativePicker|first-contact|WhoFirstContact/);
  assert.doesNotMatch(
    flowInvite.slice(0, 5000),
    /WhoFirstContactSheet|setFirstContactOpen/,
  );
  pass('Production WHO / InstantBanFlow not wired to username first-contact');
}

console.log(`\n${passed} passed\n`);
