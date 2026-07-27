/**
 * Phase 4 Commit A — integration flows through the live owner store.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-cutover-integration.test.ts
 */
import assert from 'node:assert/strict';
import {
  assertNotificationOwnerInvariants,
  createInitialNotificationOwnerState,
  emptyComposeDraft,
  queueItemFromIncoming,
  reduceNotificationOwner,
  resetNotificationOwnerStoreForTests,
  dispatchNotificationOwner,
  getNotificationOwnerState,
  type NotificationOwnerState,
  type QueueItem,
} from '../src/notification-owner';

import type { BanInteraction as SharedBan } from '@98plus/shared';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: message });
    console.error(`FAIL — ${name}`);
    console.error(message);
  }
}

function incoming(banId: string): QueueItem {
  return {
    kind: 'incoming',
    displayId: `incoming:${banId}`,
    banId,
    card: {
      banId,
      text: `text-${banId}`,
      senderLabel: `sender-${banId}`,
    },
  };
}

function apply(
  state: NotificationOwnerState,
  input: Parameters<typeof reduceNotificationOwner>[1],
): NotificationOwnerState {
  const r = reduceNotificationOwner(state, input);
  assert.equal(r.rejected, null, r.rejected ?? undefined);
  return r.state;
}

function fakeBan(id: string): SharedBan {
  return {
    id,
    text: `text-${id}`,
    status: 'active',
    durationMinutes: 30,
    sender: {
      id: 's1',
      telegramId: '1',
      username: 'alice',
      firstName: 'Alice',
    },
    receiver: {
      id: 'r1',
      telegramId: '2',
      username: 'bob',
      firstName: 'Bob',
    },
    isIncoming: true,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    checkDueAt: null,
    threadId: 't1',
  } as SharedBan;
}

async function main() {
  console.log('\n=== PHASE 4 — CUTOVER INTEGRATION ===\n');

  await spec('store: BOOT → LOBBY via BOOT_COMPLETE', () => {
    resetNotificationOwnerStoreForTests();
    assert.equal(getNotificationOwnerState().presentation.kind, 'BOOT');
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
    assert.equal(getNotificationOwnerState().presentation.kind, 'LOBBY');
  });

  await spec('store: LOBBY claims via CLAIM_NEXT after ingest', () => {
    resetNotificationOwnerStoreForTests();
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
    dispatchNotificationOwner({
      type: 'ITEMS_INGESTED',
      items: [incoming('A')],
    });
    assert.equal(getNotificationOwnerState().presentation.kind, 'LOBBY');
    assert.equal(getNotificationOwnerState().queue.length, 1);
    dispatchNotificationOwner({ type: 'CLAIM_NEXT' });
    const s = getNotificationOwnerState();
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'A');
    }
    assert.equal(s.queue.length, 0);
  });

  await spec('live ingest helper claims only when Lobby idle', async () => {
    const { ingestAndClaimIfLobby } = await import(
      '../src/notification-owner/notification-owner.live-ingest'
    );
    resetNotificationOwnerStoreForTests();
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
    ingestAndClaimIfLobby([incoming('L1')]);
    assert.equal(getNotificationOwnerState().presentation.kind, 'INCOMING');

    resetNotificationOwnerStoreForTests();
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
    dispatchNotificationOwner({
      type: 'OPEN_WHAT',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'park me' }),
    });
    ingestAndClaimIfLobby([incoming('parked')]);
    assert.equal(getNotificationOwnerState().presentation.kind, 'WHAT');
    assert.equal(getNotificationOwnerState().queue.length, 1);
  });

  await spec('store: SUCCESS → INCOMING atomic via CLOSE_SUCCESS', () => {
    resetNotificationOwnerStoreForTests();
    let s = createInitialNotificationOwnerState();
    s = apply(s, { type: 'BOOT_COMPLETE', next: null });
    s = apply(s, { type: 'ITEMS_INGESTED', items: [incoming('B')] });
    assert.equal(s.presentation.kind, 'LOBBY');
    s = apply(s, {
      type: 'OPEN_WHAT',
      draft: emptyComposeDraft({
        selectedUserId: 'u1',
        banText: 'hello world',
      }),
    });
    s = apply(s, { type: 'OPEN_CONFIRM' });
    s = apply(s, { type: 'SUBMIT_SEND' });
    s = apply(s, { type: 'SEND_SUCCEEDED' });
    assert.equal(s.presentation.kind, 'SUCCESS');
    s = apply(s, { type: 'CLOSE_SUCCESS' });
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'B');
    }
    assert.equal(assertNotificationOwnerInvariants(s).length, 0);
  });

  await spec('ingest maps BanInteraction → complete incoming QueueItem', () => {
    const item = queueItemFromIncoming(fakeBan('ban-9'));
    assert.equal(item.kind, 'incoming');
    assert.equal(item.banId, 'ban-9');
    assert.ok(item.card.text.length > 0);
    assert.ok(item.card.senderLabel.length > 0);
  });

  await spec('BOOT_COMPLETE claims queue ingested during BOOT', () => {
    resetNotificationOwnerStoreForTests();
    dispatchNotificationOwner({
      type: 'ITEMS_INGESTED',
      items: [incoming('startup')],
    });
    assert.equal(getNotificationOwnerState().presentation.kind, 'BOOT');
    assert.equal(getNotificationOwnerState().queue.length, 1);
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
    const s = getNotificationOwnerState();
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'startup');
    }
  });

  await spec('INCOMING → overboard → RESULT → LOBBY', () => {
    resetNotificationOwnerStoreForTests();
    const a = incoming('Z');
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: a });
    dispatchNotificationOwner({
      type: 'REQUEST_CARD_ACTION',
      action: 'overboard',
    });
    assert.equal(getNotificationOwnerState().presentation.kind, 'ACTION_PENDING');
    dispatchNotificationOwner({
      type: 'ACTION_CONFIRMED',
      displayId: a.displayId,
      banId: 'Z',
      result: {
        banId: 'Z',
        title: 'Перебор',
        body: 'ok',
        outcome: 'overboard',
      },
    });
    assert.equal(getNotificationOwnerState().presentation.kind, 'RESULT');
    dispatchNotificationOwner({ type: 'CLOSE_RESULT' });
    assert.equal(getNotificationOwnerState().presentation.kind, 'LOBBY');
  });

  await spec('cutover flag is live', async () => {
    const { isNotificationOwnerCutoverLive } = await import(
      '../src/notification-owner/notification-owner.cutover'
    );
    assert.equal(isNotificationOwnerCutoverLive(), true);
  });

  await spec('page mounts NotificationOwnerHost under cutover', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const page = readFileSync(
      join(process.cwd(), 'apps/web/src/app/(miniapp)/page.tsx'),
      'utf8',
    );
    assert.ok(page.includes('NotificationOwnerHost'));
    assert.ok(page.includes('isNotificationOwnerCutoverLive'));
  });

  await spec('Providers gates GlobalOverlayHost under cutover', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const providers = readFileSync(
      join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
      'utf8',
    );
    assert.ok(providers.includes('isNotificationOwnerCutoverLive()'));
    assert.ok(providers.includes('dispatchNotificationOwner'));
    assert.ok(providers.includes('queueItemFromIncoming'));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed\n`,
  );
  if (failed.length) process.exit(1);
}

void main();
