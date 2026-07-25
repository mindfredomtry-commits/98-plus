/**
 * Active-display protection for ITEMS_RECEIVED { replaceQueue:true }.
 *
 * When lifecycle=showing with a renderable display, a stale/empty replace must
 * not clear or swap the visible head. Rejection is recorded as an explicit
 * outcome for tests/diagnostics — no unconditional production console noise.
 */
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export const STALE_REPLACE_REJECTED_ACTIVE_DISPLAY =
  'STALE_REPLACE_REJECTED_ACTIVE_DISPLAY' as const;

export type StaleReplaceGuardOutcome = {
  outcome: typeof STALE_REPLACE_REJECTED_ACTIVE_DISPLAY;
  lifecycleStatus: NotificationRuntimeState['lifecycle']['status'];
  activeDisplayItemId: string | null;
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

export function activeDisplayItemId(
  state: NotificationRuntimeState,
): string | null {
  const payload = state.display.payload;
  if (!payload || state.display.kind == null) return null;
  if (payload.kind === 'result') {
    return notificationItemId({ kind: 'result', result: payload.result });
  }
  return notificationItemId({
    kind: payload.kind,
    ban: payload.ban,
  } as NotificationItem);
}

export function isRenderableShowing(
  state: NotificationRuntimeState,
): boolean {
  return (
    state.lifecycle.status === 'showing' &&
    state.display.kind != null &&
    state.display.payload != null
  );
}

/**
 * Returns a rejection outcome when replaceQueue must not mutate the active
 * visible head; otherwise null (caller proceeds).
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
  if (!isRenderableShowing(state)) return null;

  const activeId = activeDisplayItemId(state);
  if (!activeId) return null;

  const incomingHeadId =
    args.items.length > 0 ? notificationItemId(args.items[0]!) : null;
  const ownsTransition =
    state.lifecycle.transitionId != null &&
    args.transitionId === state.lifecycle.transitionId;

  // Empty replace never clears a valid visible head (use dismiss/RESET).
  if (args.items.length === 0) {
    return recordRejection({
      lifecycleStatus: state.lifecycle.status,
      activeDisplayItemId: activeId,
      incomingItemCount: 0,
      incomingHeadId: null,
      transitionId: args.transitionId,
      owningTransitionId: state.lifecycle.transitionId,
      reason: 'empty-replace-while-showing-renderable',
    });
  }

  // Different head: only current presentation authority may swap.
  if (incomingHeadId !== activeId && !ownsTransition) {
    return recordRejection({
      lifecycleStatus: state.lifecycle.status,
      activeDisplayItemId: activeId,
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
    outcome: STALE_REPLACE_REJECTED_ACTIVE_DISPLAY,
    ...fields,
  };
  lastRejection = rejection;
  return rejection;
}
