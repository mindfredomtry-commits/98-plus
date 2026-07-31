/**
 * Vertical V3 — runtime-owned completion edge for incoming_overboard.
 * Stage 7 Phase 1: no overlay/visibility policy — idle empty queue only.
 */
import type { NotificationRuntimeState } from './notification-runtime.types';

export type IncomingOverboardCompletion = {
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

/** Runtime settled with empty queue after overboard. */
export function isRuntimeIdleEmptyAfterOverboard(
  state: NotificationRuntimeState,
): boolean {
  return (
    state.lifecycle.status === 'idle' &&
    state.items.queue.length === 0 &&
    state.action.status === 'idle'
  );
}

export type IncomingOverboardCompletionEligibility = {
  eligible: boolean;
  reason: string | null;
  checks: {
    beforeActionStatus: string;
    beforeTargetItemId: string | null;
    wasInFlight: boolean;
    afterLifecycle: string;
    afterQueueLen: number;
    afterActionStatus: string;
    afterIdleEmpty: boolean;
    duplicateCommand: boolean;
  };
};

export function explainIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  args: { commandId: string; targetItemId: string },
): IncomingOverboardCompletionEligibility {
  const wasInFlight =
    before.action.status === 'pending' &&
    before.action.targetItemId === args.targetItemId;
  const afterIdleEmpty = isRuntimeIdleEmptyAfterOverboard(after);
  const duplicateCommand =
    snapshot.seq > 0 && snapshot.commandId === args.commandId;
  const checks = {
    beforeActionStatus: before.action.status,
    beforeTargetItemId: before.action.targetItemId,
    wasInFlight,
    afterLifecycle: after.lifecycle.status,
    afterQueueLen: after.items.queue.length,
    afterActionStatus: after.action.status,
    afterIdleEmpty,
    duplicateCommand,
  };

  if (!wasInFlight) {
    let reason = 'not-in-flight';
    if (before.action.status !== 'pending') {
      reason = `before-action-not-pending:${before.action.status}`;
    } else if (before.action.targetItemId !== args.targetItemId) {
      reason = 'before-target-mismatch';
    }
    return { eligible: false, reason, checks };
  }
  if (!afterIdleEmpty) {
    let reason = 'after-not-idle-empty';
    if (after.lifecycle.status !== 'idle') {
      reason = `after-lifecycle-not-idle:${after.lifecycle.status}`;
    } else if (after.items.queue.length !== 0) {
      reason = `after-queue-not-empty:${after.items.queue.length}`;
    } else if (after.action.status !== 'idle') {
      reason = `after-action-not-idle:${after.action.status}`;
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

export function isFinalIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  targetItemId: string,
): boolean {
  const wasInFlight =
    before.action.status === 'pending' &&
    before.action.targetItemId === targetItemId;
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

export function noteIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  args: { commandId: string; targetItemId: string },
): boolean {
  const eligibility = explainIncomingOverboardCompletion(before, after, args);
  if (!eligibility.eligible) return false;
  snapshot = {
    seq: snapshot.seq + 1,
    commandId: args.commandId,
    targetItemId: args.targetItemId,
    banId: banIdFromItemId(args.targetItemId),
  };
  for (const listener of listeners) listener();
  return true;
}

export function resetIncomingOverboardCompletionForTests(): void {
  snapshot = NO_COMPLETION;
}
