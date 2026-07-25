/**
 * Vertical V3 — runtime-owned completion edge for incoming_overboard.
 *
 * V2 made the runtime the sole authority for the overboard transition
 * (submit → consume head → next / idle). The host still owns obsolete
 * presentation state (lobby CTA session, stable incoming pin, visual dim
 * session) that used to be released by the retired host result path.
 *
 * This module publishes one edge — "the overboard chain ended with an empty
 * runtime" — so hosts can clear their own obsolete UI state. It never
 * dispatches, never consumes the queue and never selects a head.
 */
import { selectOverlayVisible } from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';

export type IncomingOverboardCompletion = {
  /** Monotonic edge counter; 0 = no completion yet. Hosts must dedupe on it. */
  seq: number;
  commandId: string | null;
  targetItemId: string | null;
  banId: string | null;
};

const NO_COMPLETION: IncomingOverboardCompletion = {
  seq: 0,
  commandId: null,
  targetItemId: null,
  banId: null,
};

let snapshot: IncomingOverboardCompletion = NO_COMPLETION;
const listeners = new Set<() => void>();

function banIdFromItemId(itemId: string): string {
  return itemId.startsWith('incoming:')
    ? itemId.slice('incoming:'.length)
    : itemId;
}

/** Runtime is fully settled with nothing left to paint. */
export function isRuntimeIdleEmptyAfterOverboard(
  state: NotificationRuntimeState,
): boolean {
  return (
    state.lifecycle.status === 'idle' &&
    state.display.kind == null &&
    state.display.payload == null &&
    state.items.queue.length === 0 &&
    state.action.status === 'idle' &&
    !selectOverlayVisible(state)
  );
}

export type IncomingOverboardCompletionEligibility = {
  eligible: boolean;
  /** Exact failed condition when eligible=false; null when eligible. */
  reason: string | null;
  checks: {
    beforeActionStatus: string;
    beforeTargetItemId: string | null;
    beforeOverlayVisible: boolean;
    wasInFlight: boolean;
    afterLifecycle: string;
    afterDisplayKind: string | null;
    afterDisplayPayloadNull: boolean;
    afterQueueLen: number;
    afterActionStatus: string;
    afterOverlayVisible: boolean;
    afterIdleEmpty: boolean;
    duplicateCommand: boolean;
  };
};

/**
 * Diagnostic eligibility breakdown for the V3 completion edge.
 * Does not emit; product emit path remains noteIncomingOverboardCompletion.
 */
export function explainIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  args: { commandId: string; targetItemId: string },
): IncomingOverboardCompletionEligibility {
  const beforeOverlayVisible = selectOverlayVisible(before);
  const wasInFlight =
    before.action.status === 'pending' &&
    before.action.targetItemId === args.targetItemId &&
    beforeOverlayVisible;
  const afterIdleEmpty = isRuntimeIdleEmptyAfterOverboard(after);
  const duplicateCommand =
    snapshot.seq > 0 && snapshot.commandId === args.commandId;
  const checks = {
    beforeActionStatus: before.action.status,
    beforeTargetItemId: before.action.targetItemId,
    beforeOverlayVisible,
    wasInFlight,
    afterLifecycle: after.lifecycle.status,
    afterDisplayKind: after.display.kind,
    afterDisplayPayloadNull: after.display.payload == null,
    afterQueueLen: after.items.queue.length,
    afterActionStatus: after.action.status,
    afterOverlayVisible: selectOverlayVisible(after),
    afterIdleEmpty,
    duplicateCommand,
  };

  if (!wasInFlight) {
    let reason = 'not-in-flight';
    if (before.action.status !== 'pending') {
      reason = `before-action-not-pending:${before.action.status}`;
    } else if (before.action.targetItemId !== args.targetItemId) {
      reason = 'before-target-mismatch';
    } else if (!beforeOverlayVisible) {
      reason = 'before-overlay-not-visible';
    }
    return { eligible: false, reason, checks };
  }
  if (!afterIdleEmpty) {
    let reason = 'after-not-idle-empty';
    if (after.lifecycle.status !== 'idle') {
      reason = `after-lifecycle-not-idle:${after.lifecycle.status}`;
    } else if (after.display.kind != null || after.display.payload != null) {
      reason = `after-display-not-null:${after.display.kind ?? 'payload'}`;
    } else if (after.items.queue.length !== 0) {
      reason = `after-queue-not-empty:${after.items.queue.length}`;
    } else if (after.action.status !== 'idle') {
      reason = `after-action-not-idle:${after.action.status}`;
    } else if (selectOverlayVisible(after)) {
      reason = 'after-overlay-still-visible';
    }
    return { eligible: false, reason, checks };
  }
  if (duplicateCommand) {
    return {
      eligible: false,
      reason: 'duplicate-commandId',
      checks,
    };
  }
  return { eligible: true, reason: null, checks };
}

/**
 * True only for the final overboard of a chain: an in-flight action on the
 * visible head became a settled empty runtime. Advancing to the next queued
 * card (still showing) and API failure both return false.
 */
export function isFinalIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  targetItemId: string,
): boolean {
  const wasInFlight =
    before.action.status === 'pending' &&
    before.action.targetItemId === targetItemId &&
    selectOverlayVisible(before);
  if (!wasInFlight) return false;
  return isRuntimeIdleEmptyAfterOverboard(after);
}

export function subscribeIncomingOverboardCompletion(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getIncomingOverboardCompletionSnapshot(): IncomingOverboardCompletion {
  return snapshot;
}

/** Publishes the edge when the transition qualifies. Returns true when emitted. */
export function noteIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  args: { commandId: string; targetItemId: string },
): boolean {
  if (!isFinalIncomingOverboardCompletion(before, after, args.targetItemId)) {
    return false;
  }
  // One edge per command — a replayed execute cannot restart the CTA spring.
  if (snapshot.seq > 0 && snapshot.commandId === args.commandId) {
    return false;
  }
  snapshot = {
    seq: snapshot.seq + 1,
    commandId: args.commandId,
    targetItemId: args.targetItemId,
    banId: banIdFromItemId(args.targetItemId),
  };
  for (const listener of listeners) listener();
  return true;
}

export function resetIncomingOverboardCompletionForTest(): void {
  snapshot = NO_COMPLETION;
  listeners.clear();
}
