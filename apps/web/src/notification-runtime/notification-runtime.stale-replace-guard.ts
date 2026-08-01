/**
 * Stage 7 Phase 2 — replaceQueue guard for in-flight item actions.
 *
 * Rejects empty replace while an action is in flight against a non-empty queue.
 * Does not model display/overlay ownership.
 */
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export const STALE_REPLACE_REJECTED_ACTION_HEAD =
  'STALE_REPLACE_REJECTED_ACTION_HEAD' as const;

export type StaleReplaceGuardOutcome = {
  outcome: typeof STALE_REPLACE_REJECTED_ACTION_HEAD;
  lifecycleStatus: NotificationRuntimeState['lifecycle']['status'];
  readyHeadId: string | null;
  incomingItemCount: number;
  incomingHeadId: string | null;
  transitionId: string | null;
  owningTransitionId: string | null;
  reason: string;
};

let lastRejection: StaleReplaceGuardOutcome | null = null;

export function resetStaleReplaceGuardForTests(): void {
  lastRejection = null;
}

export function getLastStaleReplaceRejection(): StaleReplaceGuardOutcome | null {
  return lastRejection;
}

export function selectReadyHeadIdForGuard(
  state: NotificationRuntimeState,
): string | null {
  const head = state.items.queue[0];
  return head ? notificationItemId(head) : null;
}

function isActionInFlight(state: NotificationRuntimeState): boolean {
  return (
    state.lifecycle.status === 'submitting' ||
    state.action.status === 'pending'
  );
}

/**
 * Returns a rejection when replaceQueue must not wipe an in-flight action head.
 */
export function evaluateStaleReplaceGuard(
  state: NotificationRuntimeState,
  args: {
    replaceQueue: boolean;
    items: readonly NotificationItem[];
    transitionId: string;
  },
): StaleReplaceGuardOutcome | null {
  if (!args.replaceQueue) return null;
  if (!isActionInFlight(state)) return null;
  if (state.items.queue.length === 0) return null;

  const readyHeadId = selectReadyHeadIdForGuard(state);
  if (!readyHeadId) return null;

  const incomingHeadId =
    args.items.length > 0 ? notificationItemId(args.items[0]!) : null;

  if (args.items.length === 0) {
    return recordRejection({
      lifecycleStatus: state.lifecycle.status,
      readyHeadId,
      incomingItemCount: 0,
      incomingHeadId: null,
      transitionId: args.transitionId,
      owningTransitionId: state.lifecycle.transitionId,
      reason: 'empty-replace-while-action-in-flight',
    });
  }

  if (
    incomingHeadId !== readyHeadId &&
    state.lifecycle.transitionId != null &&
    args.transitionId !== state.lifecycle.transitionId
  ) {
    return recordRejection({
      lifecycleStatus: state.lifecycle.status,
      readyHeadId,
      incomingItemCount: args.items.length,
      incomingHeadId,
      transitionId: args.transitionId,
      owningTransitionId: state.lifecycle.transitionId,
      reason: 'different-head-without-owning-transition',
    });
  }

  return null;
}

function recordRejection(
  fields: Omit<StaleReplaceGuardOutcome, 'outcome'>,
): StaleReplaceGuardOutcome {
  const rejection: StaleReplaceGuardOutcome = {
    outcome: STALE_REPLACE_REJECTED_ACTION_HEAD,
    ...fields,
  };
  lastRejection = rejection;
  return rejection;
}
