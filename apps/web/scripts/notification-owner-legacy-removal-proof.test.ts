/**
 * Phase 4 Commit B — prove superseded presentation authorities are gone.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-legacy-removal-proof.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const webRoot = join(process.cwd(), 'apps/web');
const srcRoot = join(webRoot, 'src');

const deletedFiles = [
  'src/components/GlobalOverlayHost.tsx',
  'src/components/NotificationQueueShell.tsx',
  'src/components/DirectOverboardResultLayer.tsx',
  'src/components/IncomingBanOverlay.tsx',
  'src/components/CheckOverlay.tsx',
  'src/components/ResultOverlay.tsx',
  'src/components/instant-ban/InstantBanFlow.tsx',
  'src/lib/success-to-next-handoff.ts',
  'src/lib/success-drain-empty-shell-hold.ts',
  'src/lib/incoming-dom-mount-ack.ts',
  'src/lib/observed-presentation-state.ts',
  'src/notification-runtime/notification-runtime.shell-visibility.ts',
  'src/notification-runtime/notification-runtime.success-handoff.ts',
];

for (const path of deletedFiles) {
  assert.equal(existsSync(join(webRoot, path)), false, `${path} must be removed`);
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const allSourceFiles = listSourceFiles(srcRoot);
const read = (f: string) => readFileSync(f, 'utf8');

const page = read(join(webRoot, 'src/app/(miniapp)/page.tsx'));
assert.match(page, /NotificationOwnerHost/);
assert.doesNotMatch(page, /InstantBanFlow|GlobalOverlayHost/);

const providers = read(join(webRoot, 'src/components/Providers.tsx'));
assert.match(providers, /ingestAndClaimIfLobby/);
assert.match(providers, /ingestQueuedOverlay/);

// Forbidden legacy writer symbols — must be physically gone.
for (const sym of [
  'applyOverlayQueue',
  'enqueueNotification',
  'presentNotificationOverlay',
]) {
  const offenders = allSourceFiles.filter((f) =>
    new RegExp(`\\b${sym}\\b`).test(read(f)),
  );
  assert.deepEqual(
    offenders,
    [],
    `${sym} must not remain callable under apps/web/src: ${offenders.join(', ')}`,
  );
}

assert.doesNotMatch(
  providers,
  /legacy queue writer retired/i,
  'no silent-retirement writer comment may remain',
);

// writeQueueSnapshot must forward to owner ingest — never void-discard payloads.
{
  const start = providers.indexOf('const writeQueueSnapshot = useCallback(');
  assert.ok(start >= 0, 'writeQueueSnapshot must exist as owner-forwarding adapter');
  const slice = providers.slice(start, start + 600);
  assert.match(slice, /ingestQueuedOverlay/);
  assert.doesNotMatch(
    slice,
    /void next;\s*void options;\s*return null;/,
    'writeQueueSnapshot must not silently discard work',
  );
}

// Silent false-return queue writers forbidden.
assert.doesNotMatch(
  providers,
  /applyQueueMutationSilent[\s\S]{0,200}return false;/,
  'applyQueueMutationSilent must not silently return false',
);

// Category B globs must be zero (no rename evasion).
const categoryBFiles = allSourceFiles.filter((f) => {
  const base = f.replace(/\\/g, '/').split('/').pop()!;
  return (
    base.startsWith('notification-overlay-owner') ||
    base.startsWith('legacy-notif-shadow')
  );
});
assert.equal(
  categoryBFiles.length,
  0,
  `Category B modules must be deleted, found: ${categoryBFiles.join(', ')}`,
);

// WS/session/poll ingestion reaches notification-owner.
assert.match(providers, /ingestAndClaimIfLobby\(\[queueItemFromIncoming/);
assert.match(providers, /ingestAndClaimIfLobby\(\[queueItemFromCheck/);
assert.match(providers, /ingestAndClaimIfLobby\(\[queueItemFromResult/);

// Sole queue mutation implementation: owner reducer ITEMS_INGESTED + store dispatch.
const ownerStore = read(
  join(srcRoot, 'notification-owner/notification-owner.store.ts'),
);
const ownerReducer = read(
  join(srcRoot, 'notification-owner/notification-owner.reducer.ts'),
);
const liveIngest = read(
  join(srcRoot, 'notification-owner/notification-owner.live-ingest.ts'),
);
assert.match(ownerStore, /dispatchNotificationOwner/);
assert.match(ownerReducer, /case 'ITEMS_INGESTED'/);
assert.match(liveIngest, /export function ingestAndClaimIfLobby/);
assert.match(liveIngest, /export function ingestItems/);
assert.match(liveIngest, /export function ingestQueuedOverlay/);

// Pin-state must throw on queue authority (not silently no-op).
const pinState = read(
  join(srcRoot, 'notification-owner/notification-owner-pin-state.ts'),
);
assert.match(
  pinState,
  /must not accept queue authority event/,
  'pin-state must throw on queue authority events',
);
assert.doesNotMatch(
  pinState,
  /Vertical 9: owner is not a notification queue runtime engine[\s\S]*?return state;/,
);

// Active display: Providers must not own card paint writes.
assert.match(
  providers,
  /Active display is owned exclusively by notification-owner/,
);

console.log('notification-owner legacy removal proof: ok');
console.log(
  `Category B (notification-overlay-owner*/legacy-notif-shadow*) remaining=${categoryBFiles.length}`,
);
