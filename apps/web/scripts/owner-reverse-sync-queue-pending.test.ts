/**
 * Stage 1 Single Owner Finalization —
 * reverse sync must not write owner.queue / owner.pending.
 *
 * Run: npx tsx apps/web/scripts/owner-reverse-sync-queue-pending.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import {
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  reportReverseQueuePendingBlocked,
  type OwnerProductionSnapshot,
} from '../src/lib/notification-overlay-owner';
import { createNotificationOverlayOwnerShadow } from '../src/lib/notification-overlay-owner-shadow';

// Shadow dispatch traces touch window.__debug98log — stub for Node.
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

function resultOverlay(id: string): QueuedOverlay {
  return {
    kind: 'result',
    result: { id } as QueuedOverlay & { kind: 'result' } extends {
      result: infer R;
    }
      ? R
      : never,
  };
}

function incomingOverlay(id: string): QueuedOverlay {
  return {
    kind: 'incoming',
    ban: { id } as QueuedOverlay & { kind: 'incoming' } extends {
      ban: infer B;
    }
      ? B
      : never,
  };
}

function resultId(item: QueuedOverlay | undefined): string | null {
  return item?.kind === 'result' ? item.result.id : null;
}

function incomingId(item: QueuedOverlay | undefined): string | null {
  return item?.kind === 'incoming' ? item.ban.id : null;
}

// —— 1. syncFromProduction with foreign queue does not change owner.queue ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.dispatch(
    {
      type: 'QUEUE_APPLIED',
      queue: [resultOverlay('owner-q-1')],
      source: 'test-seed',
    },
    'test-seed',
  );
  assert.equal(shadow.getState().queue.length, 1);
  assert.equal(resultId(shadow.getState().queue[0]), 'owner-q-1');

  shadow.syncFromProduction(
    minimalSnapshot({
      queue: [resultOverlay('legacy-q-should-not-apply')],
      pending: [incomingOverlay('legacy-p-should-not-apply')],
      realHeadKind: 'result',
      realHeadBanId: 'legacy-q-should-not-apply',
      lobbyOpen: true,
    }),
    'test-reverse-with-queue',
  );

  const after = shadow.getState();
  assert.equal(after.queue.length, 1);
  assert.equal(resultId(after.queue[0]), 'owner-q-1');
  assert.equal(after.pending.length, 0);
  assert.equal(after.session.lobbyOpen, true);
}

// —— 2. syncFromProduction with pending does not change owner.pending ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.dispatch(
    {
      type: 'PENDING_QUEUE_APPLIED',
      pending: [incomingOverlay('owner-pending-1')],
      source: 'test-seed-pending',
    },
    'test-seed-pending',
  );
  assert.equal(shadow.getState().pending.length, 1);

  shadow.syncFromProduction(
    minimalSnapshot({
      pending: [
        incomingOverlay('legacy-pending-a'),
        incomingOverlay('legacy-pending-b'),
      ],
      queue: [resultOverlay('legacy-q')],
    }),
    'test-reverse-with-pending',
  );

  assert.equal(shadow.getState().pending.length, 1);
  assert.equal(incomingId(shadow.getState().pending[0]), 'owner-pending-1');
  assert.equal(shadow.getState().queue.length, 0);
}

// —— 3. syncFromProduction without queue/pending still updates compat fields ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.syncFromProduction(
    minimalSnapshot({
      lobbyOpen: true,
      drainActive: true,
      notificationMode: 'all',
      successCardMounted: true,
    }),
    'test-compat-fields',
  );
  const s = shadow.getState();
  assert.equal(s.session.lobbyOpen, true);
  assert.equal(s.session.drainActive, true);
  assert.equal(s.meta.notificationMode, 'all');
  assert.equal(s.meta.successCardMounted, true);
  assert.equal(s.queue.length, 0);
  assert.equal(s.pending.length, 0);
}

// —— 4. QUEUE_APPLIED still changes queue + emits mirror ——
{
  const initial = createInitialNotificationOverlayOwnerState();
  const { state, effects } = notificationOverlayOwnerReducer(initial, {
    type: 'QUEUE_APPLIED',
    queue: [resultOverlay('q-apply-1')],
    source: 'test',
  });
  assert.equal(state.queue.length, 1);
  assert.ok(effects.some((e) => e.type === 'MIRROR_LEGACY_QUEUE'));
}

// —— 5. PENDING_QUEUE_APPLIED still changes pending + emits mirror ——
{
  const initial = createInitialNotificationOverlayOwnerState();
  const { state, effects } = notificationOverlayOwnerReducer(initial, {
    type: 'PENDING_QUEUE_APPLIED',
    pending: [incomingOverlay('p-apply-1')],
    source: 'test',
  });
  assert.equal(state.pending.length, 1);
  assert.ok(effects.some((e) => e.type === 'MIRROR_LEGACY_PENDING'));
}

// —— 6–7. mirrorLegacyQueue / mirrorLegacyPending still receive owner data ——
{
  let mirroredQueue: QueuedOverlay[] | null = null;
  let mirroredPending: QueuedOverlay[] | null = null;
  const shadow = createNotificationOverlayOwnerShadow({
    mirrorLegacyQueue: (queue) => {
      mirroredQueue = queue;
    },
    mirrorLegacyPending: (pending) => {
      mirroredPending = pending;
    },
  });

  shadow.dispatch(
    {
      type: 'QUEUE_APPLIED',
      queue: [resultOverlay('mirror-q')],
      source: 'mirror-test',
    },
    'mirror-test',
  );
  assert.ok(mirroredQueue);
  assert.equal(mirroredQueue!.length, 1);
  assert.equal(resultId(mirroredQueue![0]), 'mirror-q');

  shadow.dispatch(
    {
      type: 'PENDING_QUEUE_APPLIED',
      pending: [incomingOverlay('mirror-p')],
      source: 'mirror-pending-test',
    },
    'mirror-pending-test',
  );
  assert.ok(mirroredPending);
  assert.equal(mirroredPending!.length, 1);
  assert.equal(incomingId(mirroredPending![0]), 'mirror-p');
}

// —— 8. bootstrap/hydration callsites do not reverse-write queue/pending ——
{
  const providers = readFileSync(
    join(__dirname, '../src/components/Providers.tsx'),
    'utf8',
  );
  const ownerSrc = readFileSync(
    join(__dirname, '../src/lib/notification-overlay-owner.ts'),
    'utf8',
  );
  assert.match(providers, /syncFromProduction/);
  assert.match(providers, /applyPendingQueueViaOwner/);
  assert.match(ownerSrc, /preserveQueuePendingAuthority:\s*true/);
  assert.match(
    ownerSrc,
    /queue\/pending are NEVER patched from production snapshots/,
  );
  assert.doesNotMatch(providers, /SHADOW_MIRROR_QUEUE/);
  assert.doesNotMatch(providers, /SHADOW_MIRROR_PENDING/);
  assert.doesNotMatch(providers, /type:\s*['\"]SHADOW_QUEUE_APPLIED['\"]/);
}

// —— 9. production source scan: no SHADOW_MIRROR_QUEUE / PENDING ——
{
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
    const text = readFileSync(file, 'utf8');
    if (
      /type:\s*['\"]SHADOW_MIRROR_QUEUE['\"]/.test(text) ||
      /type:\s*['\"]SHADOW_MIRROR_PENDING['\"]/.test(text)
    ) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
}

// —— SHADOW_QUEUE_APPLIED does not mutate queue ——
{
  const initial = createInitialNotificationOverlayOwnerState();
  initial.queue = [resultOverlay('keep-me')];
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { state } = notificationOverlayOwnerReducer(initial, {
      type: 'SHADOW_QUEUE_APPLIED',
      queue: [resultOverlay('should-not-apply')],
    });
    assert.equal(state.queue.length, 1);
    assert.equal(resultId(state.queue[0]), 'keep-me');
  } finally {
    process.env.NODE_ENV = prev;
  }
}

// —— realHead must not steal active when display IDs absent ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.dispatch(
    {
      type: 'QUEUE_APPLIED',
      queue: [resultOverlay('owner-active-q')],
      source: 'seed',
    },
    'seed',
  );
  const beforeActive = { ...shadow.getState().active };
  shadow.syncFromProduction(
    minimalSnapshot({
      queue: [resultOverlay('other')],
      realHeadKind: 'incoming',
      realHeadBanId: 'other-head',
      lobbyOpen: true,
    }),
    'realhead-should-not-override-active',
  );
  const after = shadow.getState();
  assert.equal(after.active.kind, beforeActive.kind);
  assert.equal(after.active.banId, beforeActive.banId);
  assert.equal(after.session.lobbyOpen, true);
}

// —— invariant helper throws in development ——
{
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    assert.throws(() => reportReverseQueuePendingBlocked('unit-test'));
  } finally {
    process.env.NODE_ENV = prev;
  }
}

console.log('owner-reverse-sync-queue-pending.test.ts: ok');
