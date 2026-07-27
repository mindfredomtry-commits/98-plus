/**
 * Notification Owner — pure reducer (Phase 2).
 *
 * Sole future writer for presentation / queue / display / terminal action.
 * No DOM timing. No timeouts. No React. No legacy bridges.
 */

import {
  assertNotificationOwnerInvariants,
} from './notification-owner.invariants';
import type {
  BanId,
  DisplayId,
  NotificationOwnerInput,
  NotificationOwnerReduceResult,
  NotificationOwnerState,
  NotificationPresentationState,
  QueueItem,
  ResultCardModel,
  SuccessSnapshot,
} from './notification-owner.types';
import {
  createInitialNotificationOwnerState,
  emptyComposeDraft,
  filterUnconsumedQueue,
  isConsumedBan,
} from './notification-owner.types';

function ok(
  state: NotificationOwnerState,
): NotificationOwnerReduceResult {
  const violations = assertNotificationOwnerInvariants(state);
  if (violations.length > 0) {
    throw new Error(
      `NotificationOwner invariant violated: ${violations
        .map((v) => v.code)
        .join(', ')}`,
    );
  }
  return { state, rejected: null };
}

function reject(
  state: NotificationOwnerState,
  reason: string,
): NotificationOwnerReduceResult {
  return { state, rejected: reason };
}

function presentationFromQueueItem(
  item: QueueItem,
): NotificationPresentationState {
  if (item.kind === 'incoming') {
    return {
      kind: 'INCOMING',
      displayId: item.displayId,
      banId: item.banId,
      card: item.card,
    };
  }
  if (item.kind === 'check') {
    return {
      kind: 'CHECK',
      displayId: item.displayId,
      banId: item.banId,
      card: item.card,
    };
  }
  return {
    kind: 'RESULT',
    displayId: item.displayId,
    banId: item.banId,
    card: item.card,
  };
}

function fullLobby(): NotificationPresentationState {
  return { kind: 'LOBBY', mode: 'full' };
}

/**
 * Claim head: remove from queue and install as presentation.
 * Returns null if queue empty → caller releases Lobby.
 */
function claimNext(
  state: NotificationOwnerState,
): {
  presentation: NotificationPresentationState;
  queue: QueueItem[];
} | null {
  if (state.queue.length === 0) return null;
  const [head, ...rest] = state.queue;
  if (isConsumedBan(state, head.banId)) {
    // Should be unreachable if filter kept; skip defensively.
    return claimNext({ ...state, queue: rest });
  }
  return {
    presentation: presentationFromQueueItem(head),
    queue: rest,
  };
}

function markConsumed(
  state: NotificationOwnerState,
  banId: BanId,
  displayId: DisplayId,
): NotificationOwnerState {
  if (state.consumed.some((t) => t.banId === banId)) {
    return {
      ...state,
      queue: filterUnconsumedQueue(state.queue, state.consumed),
    };
  }
  const consumed = [
    ...state.consumed,
    { banId, displayId, awaitingServerClear: true },
  ];
  return {
    ...state,
    consumed,
    queue: filterUnconsumedQueue(state.queue, consumed),
    terminalCommits: state.terminalCommits.includes(displayId)
      ? state.terminalCommits
      : [...state.terminalCommits, displayId],
  };
}

/**
 * After terminal consume: SELECT_NEXT → RESULT | INCOMING/CHECK | LOBBY.
 * If `result` provided, RESULT becomes the next presentation (not re-queued).
 */
function selectNextAfterConsume(
  state: NotificationOwnerState,
  result: ResultCardModel | null,
): NotificationOwnerState {
  if (result) {
    const displayId = `result:${result.banId}`;
    return {
      ...state,
      action: null,
      presentation: {
        kind: 'RESULT',
        displayId,
        banId: result.banId,
        card: result,
      },
    };
  }
  const next = claimNext(state);
  if (!next) {
    return {
      ...state,
      action: null,
      presentation: fullLobby(),
    };
  }
  return {
    ...state,
    action: null,
    presentation: next.presentation,
    queue: next.queue,
  };
}

function snapshotFromDraft(
  draft: { selectedUserId: string | null; banText: string; durationMinutes: number; replyToBanId: string | null },
): SuccessSnapshot | null {
  if (!draft.selectedUserId) return null;
  return {
    selectedUserId: draft.selectedUserId,
    banText: draft.banText,
    durationMinutes: draft.durationMinutes,
    replyToBanId: draft.replyToBanId,
  };
}

export function reduceNotificationOwner(
  state: NotificationOwnerState,
  input: NotificationOwnerInput,
): NotificationOwnerReduceResult {
  switch (input.type) {
    case 'BOOT_COMPLETE': {
      if (state.presentation.kind !== 'BOOT') {
        return reject(state, 'boot-complete-not-in-boot');
      }
      if (input.next) {
        if (isConsumedBan(state, input.next.banId)) {
          return ok({
            ...state,
            presentation: fullLobby(),
          });
        }
        return ok({
          ...state,
          presentation: presentationFromQueueItem(input.next),
        });
      }
      return ok({
        ...state,
        presentation: fullLobby(),
      });
    }

    case 'OPEN_WHAT': {
      if (
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'WHAT' &&
        state.presentation.kind !== 'CONFIRM'
      ) {
        return reject(state, 'open-what-invalid-presentation');
      }
      const base =
        state.presentation.kind === 'WHAT' ||
        state.presentation.kind === 'CONFIRM'
          ? state.presentation.draft
          : emptyComposeDraft();
      return ok({
        ...state,
        presentation: {
          kind: 'WHAT',
          draft: { ...base, ...input.draft },
        },
      });
    }

    case 'EDIT_DRAFT': {
      if (
        state.presentation.kind !== 'WHAT' &&
        state.presentation.kind !== 'CONFIRM'
      ) {
        return reject(state, 'edit-draft-invalid-presentation');
      }
      return ok({
        ...state,
        presentation: {
          kind: state.presentation.kind,
          draft: { ...state.presentation.draft, ...input.draft },
        },
      });
    }

    case 'OPEN_CONFIRM': {
      if (state.presentation.kind !== 'WHAT') {
        return reject(state, 'open-confirm-requires-what');
      }
      if (!state.presentation.draft.selectedUserId) {
        return reject(state, 'open-confirm-missing-target');
      }
      if (!state.presentation.draft.banText.trim()) {
        return reject(state, 'open-confirm-missing-text');
      }
      return ok({
        ...state,
        presentation: {
          kind: 'CONFIRM',
          draft: state.presentation.draft,
        },
      });
    }

    case 'SUBMIT_SEND': {
      if (state.presentation.kind !== 'CONFIRM') {
        return reject(state, 'submit-send-requires-confirm');
      }
      const snapshot = snapshotFromDraft(state.presentation.draft);
      if (!snapshot) {
        return reject(state, 'submit-send-missing-snapshot');
      }
      return ok({
        ...state,
        presentation: { kind: 'SENDING', snapshot },
      });
    }

    case 'SEND_SUCCEEDED': {
      if (state.presentation.kind !== 'SENDING') {
        return reject(state, 'send-succeeded-requires-sending');
      }
      const snapshot = input.snapshot ?? state.presentation.snapshot;
      return ok({
        ...state,
        presentation: { kind: 'SUCCESS', snapshot },
      });
    }

    case 'SEND_FAILED': {
      if (state.presentation.kind !== 'SENDING') {
        return reject(state, 'send-failed-requires-sending');
      }
      return ok({
        ...state,
        presentation: {
          kind: 'CONFIRM',
          draft: {
            selectedUserId: state.presentation.snapshot.selectedUserId,
            banText: state.presentation.snapshot.banText,
            durationMinutes: state.presentation.snapshot.durationMinutes,
            replyToBanId: state.presentation.snapshot.replyToBanId,
          },
        },
      });
    }

    case 'CLOSE_SUCCESS': {
      if (state.presentation.kind !== 'SUCCESS') {
        return reject(state, 'close-success-requires-success');
      }
      // Atomic: stay SUCCESS until a complete next card exists; else full Lobby.
      const next = claimNext(state);
      if (!next) {
        return ok({
          ...state,
          presentation: fullLobby(),
          queue: [],
        });
      }
      return ok({
        ...state,
        presentation: next.presentation,
        queue: next.queue,
      });
    }

    case 'REQUEST_CARD_ACTION': {
      const p = state.presentation;
      if (p.kind !== 'INCOMING' && p.kind !== 'CHECK') {
        return reject(state, 'request-action-requires-incoming-or-check');
      }
      if (state.terminalCommits.includes(p.displayId)) {
        return reject(state, 'request-action-already-terminal');
      }
      if (state.action) {
        return reject(state, 'request-action-already-in-flight');
      }
      return ok({
        ...state,
        action: {
          displayId: p.displayId,
          banId: p.banId,
          status: 'requested',
        },
        presentation: {
          kind: 'ACTION_PENDING',
          displayId: p.displayId,
          banId: p.banId,
          from: p.kind,
          card: p.card,
          action: input.action,
        },
      });
    }

    case 'ACTION_CONFIRMED': {
      if (!state.action) {
        return reject(state, 'action-confirmed-without-ledger');
      }
      if (
        state.action.displayId !== input.displayId ||
        state.action.banId !== input.banId
      ) {
        return reject(state, 'action-confirmed-id-mismatch');
      }
      if (state.terminalCommits.includes(input.displayId)) {
        // Idempotent: already committed — no second terminal.
        return reject(state, 'action-confirmed-already-committed');
      }
      if (state.presentation.kind !== 'ACTION_PENDING') {
        return reject(state, 'action-confirmed-requires-action-pending');
      }

      // Required order:
      // ACTION_CONFIRMED → MARK_LOCAL_CONSUMED → REMOVE_FROM_ACTIVE
      // → SELECT_NEXT → RESULT | INCOMING | LOBBY
      const afterConsume = markConsumed(
        {
          ...state,
          action: { ...state.action, status: 'confirmed' },
        },
        input.banId,
        input.displayId,
      );
      const result =
        input.result ??
        (input.consumeOnly === true ? null : null);
      return ok(selectNextAfterConsume(afterConsume, result));
    }

    case 'ACTION_FAILED': {
      if (!state.action) {
        return reject(state, 'action-failed-without-ledger');
      }
      if (
        state.action.displayId !== input.displayId ||
        state.action.banId !== input.banId
      ) {
        return reject(state, 'action-failed-id-mismatch');
      }
      if (state.presentation.kind !== 'ACTION_PENDING') {
        return reject(state, 'action-failed-requires-action-pending');
      }
      // Restore the same card — display never cleared before terminal.
      const from = state.presentation.from;
      const card = state.presentation.card;
      const restored: NotificationPresentationState =
        from === 'INCOMING'
          ? {
              kind: 'INCOMING',
              displayId: input.displayId,
              banId: input.banId,
              card: card as Extract<
                NotificationPresentationState,
                { kind: 'INCOMING' }
              >['card'],
            }
          : {
              kind: 'CHECK',
              displayId: input.displayId,
              banId: input.banId,
              card: card as Extract<
                NotificationPresentationState,
                { kind: 'CHECK' }
              >['card'],
            };
      return ok({
        ...state,
        action: null,
        presentation: restored,
      });
    }

    case 'DISMISS_CARD': {
      const p = state.presentation;
      if (
        p.kind !== 'INCOMING' &&
        p.kind !== 'CHECK' &&
        p.kind !== 'RESULT'
      ) {
        return reject(state, 'dismiss-requires-card');
      }
      if (state.terminalCommits.includes(p.displayId)) {
        return reject(state, 'dismiss-already-terminal');
      }
      const after = markConsumed(state, p.banId, p.displayId);
      return ok(selectNextAfterConsume(after, null));
    }

    case 'CLOSE_RESULT': {
      if (state.presentation.kind !== 'RESULT') {
        return reject(state, 'close-result-requires-result');
      }
      // Result already terminal for its ban when produced via action;
      // closing advances without double-consuming.
      const banId = state.presentation.banId;
      const displayId = state.presentation.displayId;
      let nextState = state;
      if (!state.terminalCommits.includes(displayId)) {
        nextState = markConsumed(state, banId, displayId);
      }
      return ok(selectNextAfterConsume({ ...nextState, action: null }, null));
    }

    case 'ITEMS_INGESTED': {
      // Stale refresh must not reinsert consumed bans.
      const merged = filterUnconsumedQueue(
        [...state.queue, ...input.items],
        state.consumed,
      );
      // Also drop items matching the active card ban.
      const activeBan =
        state.presentation.kind === 'INCOMING' ||
        state.presentation.kind === 'CHECK' ||
        state.presentation.kind === 'ACTION_PENDING' ||
        state.presentation.kind === 'RESULT'
          ? state.presentation.banId
          : null;
      const activeDisplay = displayIdOfActive(state.presentation);
      const queue = merged.filter(
        (item) =>
          item.banId !== activeBan && item.displayId !== activeDisplay,
      );
      return ok({ ...state, queue });
    }

    case 'SERVER_PENDING_CLEARED': {
      return ok({
        ...state,
        consumed: state.consumed.filter((t) => t.banId !== input.banId),
      });
    }

    default: {
      const _exhaustive: never = input;
      void _exhaustive;
      return reject(state, 'unknown-input');
    }
  }
}

function displayIdOfActive(
  p: NotificationPresentationState,
): DisplayId | null {
  switch (p.kind) {
    case 'INCOMING':
    case 'CHECK':
    case 'ACTION_PENDING':
    case 'RESULT':
      return p.displayId;
    default:
      return null;
  }
}

export function reduceNotificationOwnerUnchecked(
  state: NotificationOwnerState,
  inputs: NotificationOwnerInput[],
): NotificationOwnerState {
  let cur = state;
  for (const input of inputs) {
    const result = reduceNotificationOwner(cur, input);
    if (result.rejected) {
      throw new Error(`rejected ${input.type}: ${result.rejected}`);
    }
    cur = result.state;
  }
  return cur;
}

export { createInitialNotificationOwnerState };
