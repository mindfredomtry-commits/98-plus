/**
 * Phase 2 — Notification Owner pure contract tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-reducer.test.ts
 *
 * No JSX. No Providers. No DOM. No timeouts.
 */
import assert from 'node:assert/strict';
import {
  assertNotificationOwnerInvariants,
  createInitialNotificationOwnerState,
  emptyComposeDraft,
  paintedKind,
  reduceNotificationOwner,
  reduceNotificationOwnerUnchecked,
  type IncomingCardModel,
  type NotificationOwnerState,
  type QueueItem,
  type ResultCardModel,
} from '../src/notification-owner';

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

function incoming(
  banId: string,
  overrides: Partial<IncomingCardModel> = {},
): QueueItem {
  return {
    kind: 'incoming',
    displayId: `incoming:${banId}`,
    banId,
    card: {
      banId,
      text: overrides.text ?? `text-${banId}`,
      senderLabel: overrides.senderLabel ?? `sender-${banId}`,
    },
  };
}

function resultCard(banId: string): ResultCardModel {
  return {
    banId,
    title: `result-${banId}`,
    body: `body-${banId}`,
    outcome: 'overboard',
  };
}

function assertPainted(
  state: NotificationOwnerState,
  expected: string[],
  labels: string[],
) {
  assert.equal(labels.length, expected.length);
  // labels are previous painted kinds recorded by caller
  assert.deepEqual(labels, expected);
  assert.equal(assertNotificationOwnerInvariants(state).length, 0);
}

function recordPaint(
  labels: string[],
  state: NotificationOwnerState,
): NotificationOwnerState {
  labels.push(paintedKind(state));
  return state;
}

function apply(
  state: NotificationOwnerState,
  input: Parameters<typeof reduceNotificationOwner>[1],
): NotificationOwnerState {
  const r = reduceNotificationOwner(state, input);
  assert.equal(r.rejected, null, r.rejected ?? undefined);
  assert.equal(assertNotificationOwnerInvariants(r.state).length, 0);
  return r.state;
}

async function main() {
  console.log('\n=== PHASE 2 — NOTIFICATION OWNER REDUCER ===\n');

  await spec('invariant: initial BOOT is deliberate and legal', () => {
    const s = createInitialNotificationOwnerState();
    assert.equal(s.presentation.kind, 'BOOT');
    assert.equal(assertNotificationOwnerInvariants(s).length, 0);
  });

  await spec('Flow A: BOOT → FULL LOBBY', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    painted.push(paintedKind(s));
    s = recordPaint(painted, apply(s, { type: 'BOOT_COMPLETE', next: null }));
    assertPainted(s, ['BOOT', 'LOBBY'], painted);
    assert.equal(s.presentation.kind, 'LOBBY');
    if (s.presentation.kind === 'LOBBY') {
      assert.equal(s.presentation.mode, 'full');
    }
  });

  await spec('Flow B: WHAT → CONFIRM → SENDING → SUCCESS → FULL LOBBY', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    s = apply(s, { type: 'BOOT_COMPLETE', next: null });
    painted.push(paintedKind(s));
    s = recordPaint(
      painted,
      apply(s, {
        type: 'OPEN_WHAT',
        draft: emptyComposeDraft({
          selectedUserId: 'u1',
          banText: 'no phones',
        }),
      }),
    );
    s = recordPaint(painted, apply(s, { type: 'OPEN_CONFIRM' }));
    s = recordPaint(painted, apply(s, { type: 'SUBMIT_SEND' }));
    s = recordPaint(painted, apply(s, { type: 'SEND_SUCCEEDED' }));
    s = recordPaint(painted, apply(s, { type: 'CLOSE_SUCCESS' }));
    assertPainted(
      s,
      ['LOBBY', 'WHAT', 'CONFIRM', 'SENDING', 'SUCCESS', 'LOBBY'],
      painted,
    );
  });

  await spec('Flow C: SUCCESS → INCOMING A (atomic; no intermediate)', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    s = apply(s, { type: 'BOOT_COMPLETE', next: null });
    const a = incoming('A');
    s = apply(s, { type: 'ITEMS_INGESTED', items: [a] });
    s = apply(s, {
      type: 'OPEN_WHAT',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
    });
    s = apply(s, { type: 'OPEN_CONFIRM' });
    s = apply(s, { type: 'SUBMIT_SEND' });
    s = apply(s, { type: 'SEND_SUCCEEDED' });
    painted.push(paintedKind(s));
    assert.equal(painted[0], 'SUCCESS');
    s = recordPaint(painted, apply(s, { type: 'CLOSE_SUCCESS' }));
    assertPainted(s, ['SUCCESS', 'INCOMING'], painted);
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'A');
      assert.equal(s.presentation.card.text, 'text-A');
    }
    // No empty Lobby / orb-only / shell frames in painted sequence.
    assert.equal(painted.includes('LOBBY'), false);
  });

  await spec('Flow C guard: CLOSE_SUCCESS stays SUCCESS if queue empty of constructible cards — wait, empty → Lobby', () => {
    // Per contract: if next cannot be constructed, remain SUCCESS.
    // Empty queue IS constructible terminal → LOBBY.
    // Non-constructible = queue has items but we require complete card model —
    // our QueueItem always has complete card, so empty → LOBBY is correct.
    let s = createInitialNotificationOwnerState();
    s = apply(s, { type: 'BOOT_COMPLETE', next: null });
    s = apply(s, {
      type: 'OPEN_WHAT',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
    });
    s = apply(s, { type: 'OPEN_CONFIRM' });
    s = apply(s, { type: 'SUBMIT_SEND' });
    s = apply(s, { type: 'SEND_SUCCEEDED' });
    s = apply(s, { type: 'CLOSE_SUCCESS' });
    assert.equal(s.presentation.kind, 'LOBBY');
  });

  await spec('Flow D: INCOMING A → overboard → RESULT A → FULL LOBBY', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    painted.push(paintedKind(s));
    s = recordPaint(
      painted,
      apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' }),
    );
    s = recordPaint(
      painted,
      apply(s, {
        type: 'ACTION_CONFIRMED',
        displayId: a.displayId,
        banId: 'A',
        result: resultCard('A'),
      }),
    );
    s = recordPaint(painted, apply(s, { type: 'CLOSE_RESULT' }));
    assertPainted(
      s,
      ['INCOMING', 'ACTION_PENDING', 'RESULT', 'LOBBY'],
      painted,
    );
    assert.ok(s.consumed.some((t) => t.banId === 'A'));
    assert.ok(s.terminalCommits.includes(a.displayId));
  });

  await spec('Flow D alt: INCOMING A → overboard → FULL LOBBY (consumeOnly)', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    painted.push(paintedKind(s));
    s = recordPaint(
      painted,
      apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' }),
    );
    s = recordPaint(
      painted,
      apply(s, {
        type: 'ACTION_CONFIRMED',
        displayId: a.displayId,
        banId: 'A',
        consumeOnly: true,
      }),
    );
    assertPainted(s, ['INCOMING', 'ACTION_PENDING', 'LOBBY'], painted);
  });

  await spec('Flow E: INCOMING A → action → INCOMING B; A never reappears', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    const b = incoming('B');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'ITEMS_INGESTED', items: [b] });
    painted.push(paintedKind(s));
    s = recordPaint(
      painted,
      apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' }),
    );
    s = recordPaint(
      painted,
      apply(s, {
        type: 'ACTION_CONFIRMED',
        displayId: a.displayId,
        banId: 'A',
        consumeOnly: true,
      }),
    );
    assertPainted(s, ['INCOMING', 'ACTION_PENDING', 'INCOMING'], painted);
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'B');
    }
    // Stale re-ingest of A must not return A.
    s = apply(s, { type: 'ITEMS_INGESTED', items: [a] });
    assert.equal(s.queue.some((q) => q.banId === 'A'), false);
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'B');
    }
  });

  await spec('Flow F: stale refresh returns A after terminal — filtered by tombstone', () => {
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' });
    s = apply(s, {
      type: 'ACTION_CONFIRMED',
      displayId: a.displayId,
      banId: 'A',
      consumeOnly: true,
    });
    assert.equal(s.presentation.kind, 'LOBBY');
    s = apply(s, { type: 'ITEMS_INGESTED', items: [a, incoming('C')] });
    assert.equal(s.queue.map((q) => q.banId).join(','), 'C');
    assert.equal(s.queue.some((q) => q.banId === 'A'), false);
  });

  await spec('Flow G: multiple queued cards — each once, no Lobby flash', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    const b = incoming('B');
    const c = incoming('C');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'ITEMS_INGESTED', items: [b, c] });
    painted.push(paintedKind(s));
    // dismiss A → B
    s = recordPaint(painted, apply(s, { type: 'DISMISS_CARD' }));
    s = recordPaint(painted, apply(s, { type: 'DISMISS_CARD' }));
    s = recordPaint(painted, apply(s, { type: 'DISMISS_CARD' }));
    assertPainted(
      s,
      ['INCOMING', 'INCOMING', 'INCOMING', 'LOBBY'],
      painted,
    );
    // No LOBBY between cards.
    assert.deepEqual(painted.slice(0, 3), ['INCOMING', 'INCOMING', 'INCOMING']);
  });

  await spec('Flow H: startup with stale result — one complete RESULT, no blank/Lobby under', () => {
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    painted.push(paintedKind(s));
    const stale: QueueItem = {
      kind: 'result',
      displayId: 'result:stale',
      banId: 'stale',
      card: resultCard('stale'),
    };
    s = recordPaint(
      painted,
      apply(s, { type: 'BOOT_COMPLETE', next: stale }),
    );
    assertPainted(s, ['BOOT', 'RESULT'], painted);
    assert.equal(s.presentation.kind, 'RESULT');
    assert.equal(painted.includes('LOBBY'), false);
  });

  await spec('terminal action is idempotent — second confirm rejected', () => {
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' });
    s = apply(s, {
      type: 'ACTION_CONFIRMED',
      displayId: a.displayId,
      banId: 'A',
      consumeOnly: true,
    });
    const second = reduceNotificationOwner(s, {
      type: 'ACTION_CONFIRMED',
      displayId: a.displayId,
      banId: 'A',
      consumeOnly: true,
    });
    assert.equal(second.rejected, 'action-confirmed-without-ledger');
  });

  await spec('ACTION_FAILED restores same card — display never cleared early', () => {
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' });
    assert.equal(s.presentation.kind, 'ACTION_PENDING');
    s = apply(s, {
      type: 'ACTION_FAILED',
      displayId: a.displayId,
      banId: 'A',
    });
    assert.equal(s.presentation.kind, 'INCOMING');
    if (s.presentation.kind === 'INCOMING') {
      assert.equal(s.presentation.banId, 'A');
      assert.equal(s.presentation.displayId, a.displayId);
    }
    assert.equal(s.action, null);
    assert.equal(s.terminalCommits.includes(a.displayId), false);
  });

  await spec('production regression: illegal intermediate sequence is unrepresentable', () => {
    // Old illegal painted path cannot be produced by the owner reducer.
    const illegal = [
      'SUCCESS',
      'EMPTY_SHELL',
      'SUCCESS',
      'INCOMING',
      'ORB_ONLY',
      'INCOMING',
      'EMPTY_SHELL',
      'ORB_ONLY',
    ];
    const painted: string[] = [];
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: null });
    s = apply(s, { type: 'ITEMS_INGESTED', items: [a] });
    s = apply(s, {
      type: 'OPEN_WHAT',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
    });
    s = apply(s, { type: 'OPEN_CONFIRM' });
    s = apply(s, { type: 'SUBMIT_SEND' });
    s = apply(s, { type: 'SEND_SUCCEEDED' });
    painted.push(paintedKind(s));
    s = recordPaint(painted, apply(s, { type: 'CLOSE_SUCCESS' }));
    s = recordPaint(
      painted,
      apply(s, { type: 'REQUEST_CARD_ACTION', action: 'overboard' }),
    );
    s = recordPaint(
      painted,
      apply(s, {
        type: 'ACTION_CONFIRMED',
        displayId: a.displayId,
        banId: 'A',
        result: resultCard('A'),
      }),
    );
    // Legal only:
    assert.deepEqual(painted, [
      'SUCCESS',
      'INCOMING',
      'ACTION_PENDING',
      'RESULT',
    ]);
    for (const frame of painted) {
      assert.equal(
        ['EMPTY_SHELL', 'ORB_ONLY', 'LOBBY'].includes(frame),
        false,
      );
    }
    // Illegal sequence must not equal legal.
    assert.notDeepEqual(painted, illegal);
  });

  await spec('SERVER_PENDING_CLEARED removes tombstone so ban may return later', () => {
    let s = createInitialNotificationOwnerState();
    const a = incoming('A');
    s = apply(s, { type: 'BOOT_COMPLETE', next: a });
    s = apply(s, { type: 'DISMISS_CARD' });
    assert.ok(s.consumed.some((t) => t.banId === 'A'));
    s = apply(s, { type: 'SERVER_PENDING_CLEARED', banId: 'A' });
    assert.equal(s.consumed.some((t) => t.banId === 'A'), false);
    s = apply(s, { type: 'ITEMS_INGESTED', items: [a] });
    assert.equal(s.queue.some((q) => q.banId === 'A'), true);
  });

  await spec('reduceUnchecked helper chains happy path', () => {
    const a = incoming('A');
    const s = reduceNotificationOwnerUnchecked(
      createInitialNotificationOwnerState(),
      [
        { type: 'BOOT_COMPLETE', next: null },
        { type: 'ITEMS_INGESTED', items: [a] },
        {
          type: 'OPEN_WHAT',
          draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
        },
        { type: 'OPEN_CONFIRM' },
        { type: 'SUBMIT_SEND' },
        { type: 'SEND_SUCCEEDED' },
        { type: 'CLOSE_SUCCESS' },
      ],
    );
    assert.equal(s.presentation.kind, 'INCOMING');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

void main();
