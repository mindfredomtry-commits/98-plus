/**
 * Stage 3 Single Owner Finalization —
 * reverse sync must not write owner.display / owner.active.
 *
 * Run: npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/owner-reverse-sync-display-active.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  reportReverseDisplayActiveBlocked,
  type OwnerProductionSnapshot,
} from '../src/lib/notification-overlay-owner';
import { createNotificationOverlayOwnerShadow } from '../src/lib/notification-overlay-owner-shadow';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window: Record<string, unknown> }).window = {};
}

function minimalSnapshot(
  overrides: Partial<OwnerProductionSnapshot> = {},
): OwnerProductionSnapshot {
  return {
    queue: [],
    pending: [],
    realHeadKind: null,
    realHeadBanId: null,
    activeIncomingBanId: null,
    stableIncomingBanId: null,
    replyIncomingBanId: null,
    scopedIncomingBanId: null,
    activeCheckBanId: null,
    activeResultBanId: null,
    directResultOverlay: false,
    directResultOverlayActive: false,
    lobbyOpen: false,
    chainAdvanceWaiting: false,
    notificationChainTransitioning: false,
    startupHold: false,
    overlayVisible: false,
    shellKind: null,
    checkResultHoldBanId: null,
    checkResultHoldDeferredQueue: [],
    heldUserCardKind: null,
    heldUserCardBanId: null,
    atomicOverboardBanId: null,
    chainAdvanceExplicit: false,
    awaitingUser: false,
    chainHandoff: false,
    drainActive: false,
    goToBansAdvancePending: false,
    shownOverlayKeys: new Set(),
    dismissedIncomingIds: new Set(),
    dismissedCheckIds: new Set(),
    answeredCheckIds: new Set(),
    checkAnswerPendingResultShowIds: new Set(),
    checkAnswerInFlight: new Set(),
    overkillTerminalBanIds: new Set(),
    resultPriorityBanIds: new Set(),
    overboardInFlightBanId: null,
    composePhase: 'idle',
    replyComposeActive: false,
    notificationChainReplyComposeActive: false,
    chainReplyParentBanId: null,
    successCardMounted: false,
    activeTimerMounted: false,
    notificationMode: null,
    deeplinkSingleCard: false,
    deeplinkSingleCardContext: null,
    freshDeeplinkEntry: null,
    composeBlocking: false,
    ...overrides,
  };
}

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}

function result(id: string): BanResult {
  return { id } as BanResult;
}

function seedDisplayViaOwner(
  shadow: ReturnType<typeof createNotificationOverlayOwnerShadow>,
  patch: {
    incomingBan?: BanInteraction | null;
    checkBan?: BanInteraction | null;
    result?: BanResult | null;
  },
  source: string,
) {
  shadow.dispatch(
    { type: 'ACTIVE_DISPLAY_SYNC', patch, source },
    source,
  );
}

// —— 1. syncFromProduction cannot open incoming display ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.syncFromProduction(
    minimalSnapshot({
      activeIncomingBanId: 'legacy-in-open',
      lobbyOpen: true,
    }),
    'test-open-incoming',
  );
  const s = shadow.getState();
  assert.equal(s.display.incomingBan, null);
  assert.equal(s.active.kind, null);
  assert.equal(s.session.lobbyOpen, true);
}

// —— 2. syncFromProduction cannot open check display ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.syncFromProduction(
    minimalSnapshot({ activeCheckBanId: 'legacy-ck-open' }),
    'test-open-check',
  );
  assert.equal(shadow.getState().display.checkBan, null);
  assert.equal(shadow.getState().active.kind, null);
}

// —— 3. syncFromProduction cannot open result display ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.syncFromProduction(
    minimalSnapshot({
      activeResultBanId: 'legacy-rs-open',
      directResultOverlay: true,
      directResultOverlayActive: true,
    }),
    'test-open-result',
  );
  const s = shadow.getState();
  assert.equal(s.display.result, null);
  assert.equal(s.display.directResultOverlay, false);
  assert.equal(s.display.directResultOverlayActive, false);
  assert.equal(s.active.kind, null);
}

// —— 4. syncFromProduction cannot clear existing display ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  seedDisplayViaOwner(
    shadow,
    { incomingBan: ban('keep-in'), checkBan: null, result: null },
    'seed-incoming',
  );
  assert.equal(shadow.getState().display.incomingBan?.id, 'keep-in');

  shadow.syncFromProduction(
    minimalSnapshot({
      activeIncomingBanId: null,
      activeCheckBanId: null,
      activeResultBanId: null,
      lobbyOpen: true,
    }),
    'test-clear-attempt',
  );
  const s = shadow.getState();
  assert.equal(s.display.incomingBan?.id, 'keep-in');
  assert.equal(s.active.kind, 'incoming');
  assert.equal(s.active.banId, 'keep-in');
  assert.equal(s.session.lobbyOpen, true);
}

// —— 5. syncFromProduction cannot change owner.active ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  seedDisplayViaOwner(
    shadow,
    { result: result('owner-rs'), incomingBan: null, checkBan: null },
    'seed-result',
  );
  const before = shadow.getState().active;
  assert.equal(before.kind, 'result');
  assert.equal(before.banId, 'owner-rs');

  shadow.syncFromProduction(
    minimalSnapshot({
      activeResultBanId: 'other-rs',
      activeCheckBanId: 'other-ck',
      activeIncomingBanId: 'other-in',
    }),
    'test-active-mutate-attempt',
  );
  const after = shadow.getState().active;
  assert.equal(after.kind, 'result');
  assert.equal(after.banId, 'owner-rs');
  assert.equal(shadow.getState().display.result?.id, 'owner-rs');
}

// —— 6. legacy active IDs do not restore display/active ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.syncFromProduction(
    minimalSnapshot({
      activeIncomingBanId: 'restore-in',
      activeCheckBanId: 'restore-ck',
      activeResultBanId: 'restore-rs',
      stableIncomingBanId: 'restore-stable',
      replyIncomingBanId: 'restore-reply',
      scopedIncomingBanId: 'restore-scoped',
    }),
    'test-legacy-id-restore',
  );
  const s = shadow.getState();
  assert.equal(s.display.incomingBan, null);
  assert.equal(s.display.checkBan, null);
  assert.equal(s.display.result, null);
  assert.equal(s.display.stableIncomingBan, null);
  assert.equal(s.display.replyIncomingBan, null);
  assert.equal(s.display.scopedIncomingBan, null);
  assert.equal(s.active.kind, null);
  assert.equal(s.active.banId, null);
}

// —— 7–10. ACTIVE_DISPLAY_SYNC still opens/clears display + active ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  seedDisplayViaOwner(
    shadow,
    { incomingBan: ban('ads-in'), checkBan: null, result: null },
    'ads-incoming',
  );
  assert.equal(shadow.getState().display.incomingBan?.id, 'ads-in');
  assert.equal(shadow.getState().active.kind, 'incoming');

  seedDisplayViaOwner(
    shadow,
    { checkBan: ban('ads-ck'), incomingBan: null, result: null },
    'ads-check',
  );
  assert.equal(shadow.getState().display.checkBan?.id, 'ads-ck');
  assert.equal(shadow.getState().active.kind, 'check');

  shadow.dispatch(
    {
      type: 'ACTIVE_DISPLAY_SYNC',
      patch: {
        result: result('ads-rs'),
        incomingBan: null,
        checkBan: null,
        directResultOverlay: true,
        directResultOverlayActive: true,
      },
      source: 'ads-result-full',
    },
    'ads-result-full',
  );
  assert.equal(shadow.getState().display.result?.id, 'ads-rs');
  assert.equal(shadow.getState().active.kind, 'result');
  assert.equal(shadow.getState().active.source, 'direct-overboard');

  shadow.dispatch(
    {
      type: 'ACTIVE_DISPLAY_SYNC',
      patch: {
        incomingBan: null,
        checkBan: null,
        result: null,
        directResultOverlay: false,
        directResultOverlayActive: false,
      },
      source: 'ads-clear',
    },
    'ads-clear',
  );
  assert.equal(shadow.getState().display.incomingBan, null);
  assert.equal(shadow.getState().display.checkBan, null);
  assert.equal(shadow.getState().display.result, null);
  assert.equal(shadow.getState().active.kind, null);
}

// —— 11. MIRROR_LEGACY_ACTIVE still projects owner display ——
{
  let mirrored: {
    incomingBan: BanInteraction | null;
    checkBan: BanInteraction | null;
    result: BanResult | null;
  } | null = null;
  const shadow = createNotificationOverlayOwnerShadow({
    mirrorLegacyActive: (display) => {
      mirrored = {
        incomingBan: display.incomingBan,
        checkBan: display.checkBan,
        result: display.result,
      };
    },
  });
  seedDisplayViaOwner(
    shadow,
    { incomingBan: ban('mirror-in'), checkBan: null, result: null },
    'mirror-test',
  );
  assert.ok(mirrored);
  assert.equal(mirrored!.incomingBan?.id, 'mirror-in');
  assert.equal(shadow.getState().display.incomingBan?.id, 'mirror-in');
}

// —— SHADOW_MIRROR_DISPLAY is blocked (no-op in production; throws in test/dev) ——
{
  const initial = createInitialNotificationOverlayOwnerState();
  const seeded = notificationOverlayOwnerReducer(initial, {
    type: 'ACTIVE_DISPLAY_SYNC',
    patch: { incomingBan: ban('block-in') },
    source: 'seed',
  }).state;

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { state } = notificationOverlayOwnerReducer(seeded, {
      type: 'SHADOW_MIRROR_DISPLAY',
      patch: { stableIncomingBan: ban('should-not-apply') },
      source: 'test-blocked',
    });
    assert.equal(state.display.incomingBan?.id, 'block-in');
    assert.equal(state.display.stableIncomingBan, null);
  } finally {
    process.env.NODE_ENV = prev;
  }

  process.env.NODE_ENV = 'development';
  try {
    assert.throws(() => {
      notificationOverlayOwnerReducer(seeded, {
        type: 'SHADOW_MIRROR_DISPLAY',
        patch: { stableIncomingBan: ban('should-not-apply') },
        source: 'test-blocked-dev',
      });
    }, /STAGE3/);
  } finally {
    process.env.NODE_ENV = prev;
  }
}

// —— preserveDisplayAuthority:false triggers invariant ——
{
  assert.throws(
    () =>
      reportReverseDisplayActiveBlocked(
        'applyProductionSnapshot:preserveDisplayAuthority=false',
      ),
    /STAGE3/,
  );
}

// —— Source scan: no production SHADOW_MIRROR_DISPLAY / preserveDisplayAuthority false ——
{
  const providers = readFileSync(
    join(__dirname, '../src/components/Providers.tsx'),
    'utf8',
  );
  const ownerSrc = readFileSync(
    join(__dirname, '../src/lib/notification-overlay-owner.ts'),
    'utf8',
  );

  assert.doesNotMatch(providers, /type:\s*['\"]SHADOW_MIRROR_DISPLAY['\"]/);
  assert.doesNotMatch(providers, /preserveDisplayAuthority\s*:\s*false/);
  assert.match(ownerSrc, /reportReverseDisplayActiveBlocked/);
  assert.match(
    ownerSrc,
    /display\/active are NEVER patched from production snapshots|display \+ active intentionally left/,
  );
  assert.match(ownerSrc, /syncActiveFromDisplay/);
  assert.doesNotMatch(providers, /exclusive-result-active-align/);

  const srcRoot = join(__dirname, '../src');
  function listTs(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...listTs(full));
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }
  const offenders: string[] = [];
  for (const file of listTs(srcRoot)) {
    if (file.replace(/\\/g, '/').endsWith('/notification-overlay-owner.ts')) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (/type:\s*['\"]SHADOW_MIRROR_DISPLAY['\"]/.test(text)) {
      offenders.push(file);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Production SHADOW_MIRROR_DISPLAY dispatches:\n${offenders.join('\n')}`,
  );
}

console.log('owner-reverse-sync-display-active.test.ts: ok');
