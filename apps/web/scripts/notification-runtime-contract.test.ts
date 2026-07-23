/**
 * Vertical 0 — Single Owner notification runtime contract tests.
 *
 * Run: npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-contract.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  assertNotificationRuntimeInvariant,
  notificationRuntimeReducer,
} from '../src/notification-runtime/notification-runtime.reducer';
import {
  selectCanonicalPendingItemIds,
  selectHasNext,
  selectIndicatorVisible,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createInitialNotificationRuntimeState,
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeEvent,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}

function result(id: string): BanResult {
  return { id } as BanResult;
}

function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}

function resultItem(id: string): NotificationItem {
  return { kind: 'result', result: result(id) };
}

function reduce(
  state: NotificationRuntimeState,
  event: NotificationRuntimeEvent,
): ReturnType<typeof notificationRuntimeReducer> {
  const out = notificationRuntimeReducer(state, event);
  assertNotificationRuntimeInvariant(out.state);
  return out;
}

function apply(
  state: NotificationRuntimeState,
  event: NotificationRuntimeEvent,
): NotificationRuntimeState {
  return reduce(state, event).state;
}

// —— 1. Initial state ——
{
  const s = createInitialNotificationRuntimeState();
  assertNotificationRuntimeInvariant(s);
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(s.items.queue.length, 0);
  assert.equal(s.display.kind, null);
  assert.equal(selectOverlayVisible(s), false);
  assert.equal(selectIndicatorVisible(s), false);
  assert.equal(selectLobbyMayShow(s), true);
}

// —— 2. Drain request from idle ——
{
  let s = createInitialNotificationRuntimeState();
  const r = reduce(s, {
    type: 'DRAIN_REQUESTED',
    transitionId: 't-drain',
    source: 'user',
  });
  s = r.state;
  assert.equal(s.lifecycle.status, 'draining');
  assert.equal(s.lifecycle.transitionId, 't-drain');
  assert.ok(r.effects.some((e) => e.type === 'FETCH_PENDING'));
  assert.equal(selectLobbyMayShow(s), false);
}

// —— 3. Items received with one card ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'DRAIN_REQUESTED',
    transitionId: 't1',
    source: 'user',
  });
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't1',
    items: [incoming('a')],
    replaceQueue: true,
    source: 'drain',
  });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.items.queue.length, 1);
  assert.equal(s.display.kind, 'incoming');
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectHasNext(s), false);
}

// —— 4. Items received with multiple cards ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't-multi',
    items: [incoming('a'), check('b')],
    replaceQueue: true,
    source: 'drain',
  });
  assert.equal(s.items.queue.length, 2);
  assert.equal(s.display.kind, 'incoming');
  assert.equal(selectHasNext(s), true);
}

// —— 5. Duplicate items deduped ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't-dup',
    items: [incoming('a'), incoming('a'), check('b')],
    replaceQueue: true,
    source: 'poll',
  });
  assert.equal(s.items.queue.length, 2);
  assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:a');
  assert.equal(notificationItemId(s.items.queue[1]!), 'check:b');
}

// —— 6. Dismiss A from [A,B] atomically shows B ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't-adv',
    items: [incoming('a'), check('b')],
    replaceQueue: true,
    source: 'drain',
  });
  const r = reduce(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 't-adv-2',
    targetItemId: 'incoming:a',
    reason: 'user_dismiss',
    source: 'user',
  });
  s = r.state;
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.items.queue.length, 1);
  assert.equal(notificationItemId(s.items.queue[0]!), 'check:b');
  assert.equal(s.display.kind, 'check');
  assert.equal(selectOverlayVisible(s), true);
  assert.ok(r.effects.some((e) => e.type === 'MARK_CONSUMED'));
}

// —— 7. During advance lobbyMayShow=false ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't7',
    items: [incoming('a'), check('b')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 't7b',
    targetItemId: 'incoming:a',
    reason: 'continue_chain',
    source: 'user',
  });
  assert.equal(selectLobbyMayShow(s), false);
  assert.equal(selectOverlayVisible(s), true);
}

// —— 8–9. Dismiss last card closes overlay + refresh pending ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't8',
    items: [resultItem('r1')],
    replaceQueue: true,
    source: 'drain',
  });
  const r = reduce(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 't8b',
    targetItemId: 'result:r1',
    reason: 'close_result',
    source: 'user',
  });
  s = r.state;
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(s.items.queue.length, 0);
  assert.equal(s.display.kind, null);
  assert.equal(selectOverlayVisible(s), false);
  assert.ok(
    r.effects.some(
      (e) => e.type === 'REFRESH_PENDING' && e.reason === 'queue-completed',
    ),
  );
  assert.ok(r.effects.some((e) => e.type === 'MARK_CONSUMED'));
}

// —— 10. First check click creates one submit ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't10',
    items: [check('c1')],
    replaceQueue: true,
    source: 'drain',
  });
  const r = reduce(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-1',
    targetItemId: 'check:c1',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  s = r.state;
  assert.equal(s.lifecycle.status, 'submitting');
  assert.equal(s.action.status, 'pending');
  assert.equal(s.action.commandId, 'cmd-1');
  assert.equal(s.display.kind, 'check');
  assert.equal(
    r.effects.filter((e) => e.type === 'SUBMIT_CARD_ACTION').length,
    1,
  );
}

// —— 11. Second check click while pending creates no submit ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't11',
    items: [check('c1')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-1',
    targetItemId: 'check:c1',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  const r = reduce(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-2',
    targetItemId: 'check:c1',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  assert.equal(r.state.action.commandId, 'cmd-1');
  assert.equal(r.effects.length, 0);
  assert.equal(r.state.lifecycle.status, 'submitting');
}

// —— 12. Check success replaces check with result atomically ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't12',
    items: [check('c1'), incoming('n2')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-s',
    targetItemId: 'check:c1',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  s = apply(s, {
    type: 'CARD_ACTION_SUCCEEDED',
    commandId: 'cmd-s',
    targetItemId: 'check:c1',
    replacement: resultItem('c1'),
    source: 'system',
  });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.display.kind, 'result');
  assert.equal(notificationItemId(s.items.queue[0]!), 'result:c1');
  assert.equal(s.items.queue.length, 2);
  assert.equal(selectOverlayVisible(s), true);
}

// —— 13. Check failure keeps check visible ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't13',
    items: [check('c1')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-f',
    targetItemId: 'check:c1',
    action: 'check_answer',
    completed: false,
    source: 'user',
  });
  s = apply(s, {
    type: 'CARD_ACTION_FAILED',
    commandId: 'cmd-f',
    targetItemId: 'check:c1',
    errorCode: 'NETWORK',
    source: 'system',
  });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.display.kind, 'check');
  assert.equal(s.action.status, 'failed');
  assert.equal(s.action.errorCode, 'NETWORK');
  assert.equal(notificationItemId(s.items.queue[0]!), 'check:c1');
}

// —— 14. Dismiss result advances to next ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't14',
    items: [resultItem('r1'), incoming('i2')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 't14b',
    targetItemId: 'result:r1',
    reason: 'go_to_bans',
    source: 'user',
  });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.display.kind, 'incoming');
  assert.equal(notificationItemId(s.items.queue[0]!), 'incoming:i2');
}

// —— 15. Lobby request ignored while showing ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't15',
    items: [incoming('a')],
    replaceQueue: true,
    source: 'drain',
  });
  const before = s.items.queue.length;
  s = apply(s, { type: 'LOBBY_REQUESTED', source: 'user' });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.items.queue.length, before);
}

// —— 16. Lobby request allowed while idle ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, { type: 'LOBBY_REQUESTED', source: 'user' });
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(selectLobbyMayShow(s), true);
}

// —— 17–19. Pending indicator / consumed / no resurrect ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: ['incoming:a', 'check:b'],
    sourceVersion: 'v1',
    source: 'poll',
  });
  assert.equal(selectIndicatorVisible(s), true);
  assert.deepEqual(selectCanonicalPendingItemIds(s), [
    'incoming:a',
    'check:b',
  ]);

  // Locally consume via dismiss completion path
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't-pend',
    items: [incoming('a')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 't-pend-d',
    targetItemId: 'incoming:a',
    reason: 'user_dismiss',
    source: 'user',
  });
  assert.ok(s.consumed.itemIds.includes('incoming:a'));

  // Server refresh still lists consumed id — must not resurrect into canonical pending
  s = apply(s, {
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: ['incoming:a', 'check:b'],
    sourceVersion: 'v2',
    source: 'poll',
  });
  assert.deepEqual(selectCanonicalPendingItemIds(s), ['check:b']);
  assert.equal(selectIndicatorVisible(s), true);

  s = apply(s, {
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: ['incoming:a'],
    sourceVersion: 'v3',
    source: 'poll',
  });
  assert.deepEqual(selectCanonicalPendingItemIds(s), []);
  assert.equal(selectIndicatorVisible(s), false);
}

// —— 20. Recovery applied produces invariant-valid state ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'RECOVERY_REQUESTED',
    transitionId: 'rec-1',
    source: 'recovery',
  });
  assert.equal(s.lifecycle.status, 'recovering');
  s = apply(s, {
    type: 'RECOVERY_APPLIED',
    transitionId: 'rec-1',
    items: [check('rc')],
    pendingItemIds: ['check:rc', 'incoming:dead'],
    consumedItemIds: ['incoming:dead'],
    sourceVersion: 'snap-1',
    snapshotVersion: 'snap-1',
    source: 'recovery',
  });
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.display.kind, 'check');
  assert.deepEqual(selectCanonicalPendingItemIds(s), ['check:rc']);
}

// —— 21. Reset returns initial state ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 't-reset',
    items: [incoming('x')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, { type: 'RESET_REQUESTED', source: 'system' });
  assert.deepEqual(s, createInitialNotificationRuntimeState());
}

// —— Regression A: No lobby flash ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 'bug-a',
    items: [incoming('in1'), check('ck1')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 'bug-a-2',
    targetItemId: 'incoming:in1',
    reason: 'user_dismiss',
    source: 'user',
  });
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectLobbyMayShow(s), false);
  assert.equal(s.lifecycle.status, 'showing');
  assert.notEqual(s.display.kind, null);
}

// —— Regression B: One-click check ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 'bug-b',
    items: [check('ck')],
    replaceQueue: true,
    source: 'drain',
  });
  const r = reduce(s, {
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'one-click',
    targetItemId: 'check:ck',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  assert.equal(r.state.lifecycle.status, 'submitting');
  assert.equal(r.state.action.status, 'pending');
  assert.equal(
    r.effects.filter((e) => e.type === 'SUBMIT_CARD_ACTION').length,
    1,
  );
}

// —— Regression C: No leftover shell ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 'bug-c',
    items: [resultItem('final')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 'bug-c-2',
    targetItemId: 'result:final',
    reason: 'close_result',
    source: 'user',
  });
  assert.equal(selectOverlayVisible(s), false);
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(s.display.kind, null);
}

// —— Regression D: Badge off after completion + reconcile ——
{
  let s = createInitialNotificationRuntimeState();
  s = apply(s, {
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: ['result:final'],
    sourceVersion: 'd1',
    source: 'poll',
  });
  assert.equal(selectIndicatorVisible(s), true);
  s = apply(s, {
    type: 'ITEMS_RECEIVED',
    transitionId: 'bug-d',
    items: [resultItem('final')],
    replaceQueue: true,
    source: 'drain',
  });
  s = apply(s, {
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: 'bug-d-2',
    targetItemId: 'result:final',
    reason: 'close_result',
    source: 'user',
  });
  // Server refresh after completion — consumed wins
  s = apply(s, {
    type: 'PENDING_SOURCE_UPDATED',
    itemIds: ['result:final'],
    sourceVersion: 'd2',
    source: 'poll',
  });
  assert.equal(selectIndicatorVisible(s), false);
  assert.deepEqual(selectCanonicalPendingItemIds(s), []);
}

// —— Source safety: Vertical 1 — sole production import is Providers ——
{
  const srcRoot = join(__dirname, '../src');

  function listTs(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full.replace(/\\/g, '/').endsWith('/notification-runtime')) continue;
        out.push(...listTs(full));
      } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
        out.push(full);
      }
    }
    return out;
  }

  const offenders: string[] = [];
  for (const file of listTs(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    if (
      /from\s+['"]@\/notification-runtime/.test(text) ||
      /from\s+['"].*notification-runtime\//.test(text)
    ) {
      offenders.push(file.replace(/\\/g, '/'));
    }
  }
  const normalized = offenders.map((f) => f.replace(/\\/g, '/'));
  const allowed = new Set([
    '/components/Providers.tsx',
    '/components/CheckOverlay.tsx',
  ]);
  assert.deepEqual(
    normalized.filter((f) => ![...allowed].some((a) => f.endsWith(a))),
    [],
    `Unexpected production imports of notification-runtime:\n${offenders.join('\n')}`,
  );
  assert.ok(
    normalized.some((f) => f.endsWith('/components/Providers.tsx')),
    'Providers must import notification-runtime (Vertical 1 wiring)',
  );
  assert.ok(
    normalized.some((f) => f.endsWith('/components/CheckOverlay.tsx')),
    'CheckOverlay must import notification-runtime selectors (Vertical 3)',
  );

  const providers = readFileSync(
    join(srcRoot, 'components/Providers.tsx'),
    'utf8',
  );
  assert.match(providers, /notification-runtime/);
  assert.match(providers, /dismissProductionHeadAtomic/);
  assert.doesNotMatch(
    providers,
    /FEATURE_FLAG.*notification.?runtime|USE_NEW_RUNTIME|notificationRuntimeEnabled/i,
  );
}

console.log('notification-runtime-contract.test.ts: ok');
console.log('  22 contract scenarios + 4 bug regressions + source scan');
