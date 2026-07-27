/**
 * Stage 2 Single Owner Finalization —
 * production display writes for incoming/check/result must go through
 * owner ACTIVE_DISPLAY_SYNC via writeOwnerDisplay / commitSyncDisplayActivePayload.
 * React setIncomingBan / setCheckBan / setResult may only be called from
 * mirrorLegacyActive (projection layer).
 *
 * Run: npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/owner-display-authority.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  type NotificationOwnerDisplayState,
  type OwnerActiveDisplayPatch,
} from '../src/lib/notification-overlay-owner';

const webRoot = join(__dirname, '..');
const providersPath = join(webRoot, 'src/components/Providers.tsx');
const ownerPath = join(webRoot, 'src/lib/notification-overlay-owner.ts');

const providersSrc = readFileSync(providersPath, 'utf8');
const ownerSrc = readFileSync(ownerPath, 'utf8');
const providersLines = providersSrc.split(/\r?\n/);

/** Body of the real mirrorLegacyActive handler (not the thin forwarder). */
function findMirrorLegacyActiveRange(lines: string[]): {
  start: number;
  end: number;
} {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes('mirrorLegacyActive: (display, source) => {')) {
      start = i;
      break;
    }
  }
  assert.ok(start >= 0, 'mirrorLegacyActive body not found');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.includes('mirrorLegacySession:')) {
      end = i;
      break;
    }
  }
  assert.ok(end > start, 'mirrorLegacySession after mirrorLegacyActive not found');
  return { start, end };
}

const mirrorRange = findMirrorLegacyActiveRange(providersLines);

const SETTER_RE = /\bset(IncomingBan|CheckBan|Result)\s*\(/;
const USE_STATE_RE =
  /const\s*\[\s*(incomingBan|checkBan|result)\s*,\s*set(IncomingBan|CheckBan|Result)\s*\]\s*=\s*useState/;

const illegalSetters: Array<{ line: number; text: string }> = [];
for (let i = 0; i < providersLines.length; i++) {
  const line = providersLines[i]!;
  if (!SETTER_RE.test(line)) continue;
  if (USE_STATE_RE.test(line)) continue;
  if (i >= mirrorRange.start && i < mirrorRange.end) continue;
  illegalSetters.push({ line: i + 1, text: line.trim() });
}

assert.equal(
  illegalSetters.length,
  0,
  `Illegal display setState calls outside mirrorLegacyActive:\n${illegalSetters
    .map((x) => `  L${x.line}: ${x.text}`)
    .join('\n')}`,
);

/** Production assignment writes to display refs (not comparisons). */
const REF_ASSIGN_RE =
  /\b(incomingBan|checkBan|result)Ref\.current\s*=(?!=)/;
const REF_USE_EFFECT_SYNC_RE =
  /(incomingBan|checkBan|result)Ref\.current\s*=\s*(incomingBan|checkBan|result)\s*;/;

const illegalRefWrites: Array<{ line: number; text: string }> = [];
for (let i = 0; i < providersLines.length; i++) {
  const line = providersLines[i]!;
  if (!REF_ASSIGN_RE.test(line)) continue;
  if (i >= mirrorRange.start && i < mirrorRange.end) continue;
  if (REF_USE_EFFECT_SYNC_RE.test(line)) continue;
  illegalRefWrites.push({ line: i + 1, text: line.trim() });
}

assert.equal(
  illegalRefWrites.length,
  0,
  `Illegal display ref writes outside mirrorLegacyActive / useEffect sync:\n${illegalRefWrites
    .map((x) => `  L${x.line}: ${x.text}`)
    .join('\n')}`,
);

assert.match(
  providersSrc,
  /writeOwnerDisplay/,
  'Providers must use writeOwnerDisplay for display authority',
);
assert.match(
  providersSrc,
  /commitSyncDisplayActivePayload/,
  'Providers must define/use commitSyncDisplayActivePayload',
);
assert.match(
  providersSrc,
  /commitSyncDisplayActivePayloadRef\.current\s*=\s*commitSyncDisplayActivePayload/,
  'commitSyncDisplayActivePayloadRef must be wired after definition',
);
assert.match(
  providersSrc,
  /displayProjectionDepthRef/,
  'mirrorLegacyActive must track displayProjectionDepthRef',
);

// Stage 1 reverse-sync guards must remain.
assert.match(
  ownerSrc,
  /Stage 1 invariant: reverse sync must not write owner\.queue \/ owner\.pending/,
  'Stage 1 reverse-sync invariant comment missing',
);
assert.match(
  ownerSrc,
  /reportReverseQueuePendingBlocked/,
  'Stage 1 reportReverseQueuePendingBlocked missing',
);
assert.match(
  ownerSrc,
  /reportReverseDisplayActiveBlocked/,
  'Stage 3 reportReverseDisplayActiveBlocked missing',
);
assert.match(
  ownerSrc,
  /queue\/pending are NEVER patched from production snapshots/,
  'Stage 1 syncFromProduction queue/pending guard comment missing',
);
assert.match(
  ownerSrc,
  /display\/active are NEVER patched from production snapshots/,
  'Stage 3 syncFromProduction display/active guard comment missing',
);
assert.match(
  ownerSrc,
  /SHADOW_QUEUE_APPLIED/,
  'Stage 1 SHADOW_QUEUE_APPLIED path missing',
);

// --- Behavioral: ACTIVE_DISPLAY_SYNC is the display authority path ---

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}

function result(id: string): BanResult {
  return { id } as BanResult;
}

function dispatchDisplay(
  state: ReturnType<typeof createInitialNotificationOverlayOwnerState>,
  patch: OwnerActiveDisplayPatch,
  source: string,
) {
  return notificationOverlayOwnerReducer(state, {
    type: 'ACTIVE_DISPLAY_SYNC',
    patch,
    source,
  });
}

function projectReact(display: NotificationOwnerDisplayState) {
  return {
    incomingBan: display.incomingBan,
    checkBan: display.checkBan,
    result: display.result,
  };
}

{
  let state = createInitialNotificationOverlayOwnerState();
  const incoming = ban('in-1');
  const r = dispatchDisplay(
    state,
    { incomingBan: incoming, checkBan: null, result: null },
    'test:open-incoming',
  );
  state = r.state;
  assert.equal(state.display.incomingBan?.id, 'in-1');
  assert.equal(state.display.checkBan, null);
  assert.equal(state.display.result, null);
  assert.ok(
    r.effects.some(
      (e) => e.type === 'MIRROR_LEGACY_ACTIVE' && e.display.incomingBan?.id === 'in-1',
    ),
    'incoming open must emit MIRROR_LEGACY_ACTIVE',
  );
  assert.deepEqual(projectReact(state.display), {
    incomingBan: incoming,
    checkBan: null,
    result: null,
  });
}

{
  let state = createInitialNotificationOverlayOwnerState();
  const check = ban('ck-1');
  const r = dispatchDisplay(
    state,
    { checkBan: check, incomingBan: null, result: null },
    'test:open-check',
  );
  state = r.state;
  assert.equal(state.display.checkBan?.id, 'ck-1');
  assert.ok(
    r.effects.some(
      (e) => e.type === 'MIRROR_LEGACY_ACTIVE' && e.display.checkBan?.id === 'ck-1',
    ),
    'check open must emit MIRROR_LEGACY_ACTIVE',
  );
  assert.deepEqual(projectReact(state.display), {
    incomingBan: null,
    checkBan: check,
    result: null,
  });
}

{
  let state = createInitialNotificationOverlayOwnerState();
  const res = result('rs-1');
  const r = dispatchDisplay(
    state,
    {
      result: res,
      incomingBan: null,
      checkBan: null,
      directResultOverlay: true,
      directResultOverlayActive: true,
    },
    'test:open-result',
  );
  state = r.state;
  assert.equal(state.display.result?.id, 'rs-1');
  assert.equal(state.display.directResultOverlayActive, true);
  assert.ok(
    r.effects.some(
      (e) => e.type === 'MIRROR_LEGACY_ACTIVE' && e.display.result?.id === 'rs-1',
    ),
    'result open must emit MIRROR_LEGACY_ACTIVE',
  );
  assert.deepEqual(projectReact(state.display), {
    incomingBan: null,
    checkBan: null,
    result: res,
  });
}

{
  let state = createInitialNotificationOverlayOwnerState();
  state = dispatchDisplay(
    state,
    { incomingBan: ban('in-clear'), checkBan: ban('ck-clear'), result: result('rs-clear') },
    'test:seed',
  ).state;
  const r = dispatchDisplay(
    state,
    {
      incomingBan: null,
      checkBan: null,
      result: null,
      directResultOverlay: false,
      directResultOverlayActive: false,
    },
    'test:dismiss-clear',
  );
  state = r.state;
  assert.equal(state.display.incomingBan, null);
  assert.equal(state.display.checkBan, null);
  assert.equal(state.display.result, null);
  const mirror = r.effects.find((e) => e.type === 'MIRROR_LEGACY_ACTIVE');
  assert.ok(mirror && mirror.type === 'MIRROR_LEGACY_ACTIVE');
  assert.equal(mirror.display.incomingBan, null);
  assert.equal(mirror.display.checkBan, null);
  assert.equal(mirror.display.result, null);
  assert.deepEqual(projectReact(state.display), {
    incomingBan: null,
    checkBan: null,
    result: null,
  });
}

{
  // Recovery/bootstrap must land in owner display first; React projection
  // is a pure mirror of owner.display (no independent React seed).
  let state = createInitialNotificationOverlayOwnerState();
  const recovered = ban('boot-in');
  const r = dispatchDisplay(
    state,
    { incomingBan: recovered, checkBan: null, result: null },
    'test:bootstrap-recovery',
  );
  state = r.state;
  const projected = projectReact(state.display);
  assert.equal(state.display.incomingBan?.id, 'boot-in');
  assert.equal(projected.incomingBan?.id, 'boot-in');
  assert.equal(projected.incomingBan, state.display.incomingBan);
}

// Bootstrap/recovery/reset/restore display paths must use writeOwnerDisplay,
// not direct React setters (already enforced by setter scan above).
assert.match(
  providersSrc,
  /'providers-reset:clear-incoming-check'/,
  'providers-reset must clear display via writeOwnerDisplay source',
);
assert.ok(
  providersSrc.includes('writeOwnerDisplay') &&
    providersSrc.includes('providers-reset:clear-incoming-check'),
  'providers-reset source must be paired with writeOwnerDisplay usage',
);
assert.ok(
  providersSrc.includes('`restoreHeldUserCardOverlay:') ||
    providersSrc.includes('restoreHeldUserCardOverlay:'),
  'held-card restore must write display via writeOwnerDisplay',
);
assert.ok(
  providersSrc.includes("'applyCheckDeeplinkDirectOverlay'"),
  'check deeplink open must write display via writeOwnerDisplay',
);
assert.ok(
  providersSrc.includes("'forceOpenOverboardResult'"),
  'force overboard result must write display via writeOwnerDisplay',
);

console.log('owner-display-authority.test.ts: ok');
console.log(
  `  mirrorLegacyActive L${mirrorRange.start + 1}-L${mirrorRange.end} (setters allowed)`,
);
console.log('  writeOwnerDisplay / commitSyncDisplayActivePayload present');
console.log('  ACTIVE_DISPLAY_SYNC behavioral cases passed');
console.log('  Stage 1 reverse-sync guards present');
