/**
 * Vertical 3 — check action lifecycle + first-click submit tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v3-check-action.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  applyPolledCheckResultToRuntime,
  executeSubmitCardActionEffect,
  requestCheckCardAction,
} from '../src/notification-runtime/notification-runtime.check-action';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectIsActionBlocked,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { notificationItemId } from '../src/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import type { QueuedOverlay } from '../src/lib/overlay-queue';
import type { OwnerActiveDisplayPatch } from '../src/notification-runtime/notification-runtime.display-patch';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id } as BanResult;
}
function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function ingest(store: ReturnType<typeof createNotificationRuntimeStore>, items: NotificationItem[]) {
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: `ingest:${items.map(notificationItemId).join(',')}`,
    items,
    replaceQueue: true,
    source: 'test',
  });
}

function sinks() {
  const writes: { queue?: QueuedOverlay[]; display?: OwnerActiveDisplayPatch }[] = [];
  return {
    writes,
    api: {
      writeQueue: (queue: QueuedOverlay[]) => {
        writes.push({ queue });
      },
      writeDisplay: (patch: OwnerActiveDisplayPatch) => {
        writes.push({ display: patch });
      },
    },
  };
}

async function main() {
// —— First click → pending + one SUBMIT ——
{
  const store = createNotificationRuntimeStore();
  ingest(store, [check('A')]);
  const before = store.getState();
  assert.equal(before.lifecycle.status, 'showing');
  assert.equal(before.action.status, 'idle');

  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-1',
  });
  assert.equal(req.accepted, true);
  assert.equal(req.effects.filter((e) => e.type === 'SUBMIT_CARD_ACTION').length, 1);
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'submitting');
  assert.equal(s.action.status, 'pending');
  assert.equal(s.action.commandId, 'cmd-1');
  assert.equal(s.display.kind, 'check');
  assert.equal(s.items.queue.length, 1);
}

// —— Second click while pending: no-op ——
{
  const store = createNotificationRuntimeStore();
  ingest(store, [check('A')]);
  requestCheckCardAction(store, { banId: 'A', completed: true, commandId: 'cmd-1' });
  const second = requestCheckCardAction(store, {
    banId: 'A',
    completed: false,
    commandId: 'cmd-2',
  });
  assert.equal(second.accepted, false);
  assert.equal(second.effects.length, 0);
  assert.equal(store.getState().action.commandId, 'cmd-1');
}

// —— Duplicate same commandId ——
{
  const store = createNotificationRuntimeStore();
  ingest(store, [check('A')]);
  requestCheckCardAction(store, { banId: 'A', completed: true, commandId: 'cmd-dup' });
  // Force idle-looking retry with same id via store dispatch path
  const again = store.dispatch({
    type: 'CARD_ACTION_REQUESTED',
    commandId: 'cmd-dup',
    targetItemId: 'check:A',
    action: 'check_answer',
    completed: true,
    source: 'user',
  });
  assert.equal(again.effects.length, 0);
}

// —— Success with result: atomic replace ——
{
  const store = createNotificationRuntimeStore();
  const { api, writes } = sinks();
  ingest(store, [check('A'), incoming('B')]);
  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-s',
  });
  const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION');
  assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');
  await executeSubmitCardActionEffect(
    store,
    effect,
    async () => ({ done: true, result: result('A') }),
    'tok',
    api,
  );
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.display.kind, 'result');
  assert.equal(notificationItemId(s.items.queue[0]!), 'result:A');
  assert.equal(s.items.queue.length, 2);
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectLobbyMayShow(s), false);
  assert.ok(writes.length > 0);
}

// —— Success waiting: check remains ——
{
  const store = createNotificationRuntimeStore();
  const { api } = sinks();
  let polled = false;
  ingest(store, [check('A')]);
  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-w',
  });
  const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION')!;
  assert.equal(effect.type, 'SUBMIT_CARD_ACTION');
  await executeSubmitCardActionEffect(
    store,
    effect,
    async () => ({ done: false, waiting: true }),
    'tok',
    {
      ...api,
      scheduleResultPoll: () => {
        polled = true;
      },
    },
  );
  const s = store.getState();
  assert.equal(s.display.kind, 'check');
  assert.equal(s.items.queue[0]?.kind, 'check');
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(s.action.status, 'succeeded');
  assert.equal(selectIsActionBlocked(s), true);
  assert.equal(polled, true);
}

// —— Failure keeps check; new commandId can retry ——
{
  const store = createNotificationRuntimeStore();
  const { api } = sinks();
  ingest(store, [check('A')]);
  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-f1',
  });
  const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION')!;
  assert.equal(effect.type, 'SUBMIT_CARD_ACTION');
  await executeSubmitCardActionEffect(
    store,
    effect,
    async () => {
      throw new Error('NETWORK');
    },
    'tok',
    api,
  );
  assert.equal(store.getState().display.kind, 'check');
  assert.equal(store.getState().action.status, 'failed');
  assert.equal(selectOverlayVisible(store.getState()), true);

  const retry = requestCheckCardAction(store, {
    banId: 'A',
    completed: false,
    commandId: 'cmd-f2',
  });
  assert.equal(retry.accepted, true);
  assert.equal(
    retry.effects.filter((e) => e.type === 'SUBMIT_CARD_ACTION').length,
    1,
  );
}

// —— Poll result applies without null gap ——
{
  const store = createNotificationRuntimeStore();
  const { api } = sinks();
  ingest(store, [check('A')]);
  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-p',
  });
  const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION')!;
  assert.equal(effect.type, 'SUBMIT_CARD_ACTION');
  await executeSubmitCardActionEffect(
    store,
    effect,
    async () => ({ done: false, waiting: true }),
    'tok',
    api,
  );
  const ok = applyPolledCheckResultToRuntime(store, 'A', result('A'), api);
  assert.equal(ok, true);
  assert.equal(store.getState().display.kind, 'result');
  assert.equal(selectOverlayVisible(store.getState()), true);
}

// —— Regression: no idle/null between check and result ——
{
  const store = createNotificationRuntimeStore();
  const snapshots: Array<{
    queueLen: number;
    display: string | null;
    overlay: boolean;
  }> = [];
  const record = () => {
    const s = store.getState();
    snapshots.push({
      queueLen: s.items.queue.length,
      display: s.display.kind,
      overlay: selectOverlayVisible(s),
    });
  };
  ingest(store, [check('A')]);
  record();
  const req = requestCheckCardAction(store, {
    banId: 'A',
    completed: true,
    commandId: 'cmd-r',
  });
  record();
  const effect = req.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION')!;
  assert.equal(effect.type, 'SUBMIT_CARD_ACTION');
  await executeSubmitCardActionEffect(
    store,
    effect,
    async () => ({ done: true, result: result('A') }),
    'tok',
    sinks().api,
  );
  record();
  for (const snap of snapshots) {
    const forbidden =
      snap.queueLen === 0 && snap.display === null && snap.overlay === false;
    assert.equal(forbidden, false);
  }
  assert.equal(store.getState().display.kind, 'result');
}

// —— Source scans ——
{
  const webSrc = join(process.cwd(), 'apps/web/src');
  const providers = readFileSync(join(webSrc, 'components/Providers.tsx'), 'utf8');
  const checkOverlay = readFileSync(
    join(webSrc, 'components/CheckOverlay.tsx'),
    'utf8',
  );

  assert.match(providers, /requestCheckCardAction/);
  assert.match(providers, /executeSubmitCardActionEffect/);
  assert.match(providers, /Vertical 3: first click = CARD_ACTION_REQUESTED/);
  assert.doesNotMatch(
    providers,
    /dismissCurrentOverlay\('user-answer', remaining, 'submitCheckAnswer'\)/,
  );
  assert.match(checkOverlay, /selectIsActionBlocked/);
  assert.match(checkOverlay, /Vertical 3: first click dispatches CARD_ACTION_REQUESTED/);
  assert.doesNotMatch(checkOverlay, /allowOverlayUserTap\s*\(/);
  assert.doesNotMatch(checkOverlay, /markOverlayUserAction\s*\(/);
  assert.doesNotMatch(checkOverlay, /api\s*<|api\(/);
  assert.doesNotMatch(
    providers,
    /FEATURE_FLAG.*check.?action|USE_NEW_CHECK_ACTION/i,
  );
}


}
main().then(() => console.log('notification-runtime-v3-check-action.test.ts: ok')).catch((e) => { console.error(e); process.exit(1); });
