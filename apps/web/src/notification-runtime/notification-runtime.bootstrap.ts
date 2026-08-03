/**
 * Stage 8 correction — sync status only. No item writes. No synthetic authority.
 *
 * Until Phase 9 truthful SNAPSHOT/DELTA, Notifications remain unavailable.
 */
import type { NotificationRuntimeStore } from './notification-runtime.store';
import { nextRuntimeTransitionId } from './notification-runtime.store';
import type { RuntimeSource } from './notification-runtime.types';

export type BootstrapOutcome = {
  accepted: boolean;
  transitionId: string;
};

/**
 * Begin sync attempt. Does not clear items (none should exist yet).
 * Does not invent SNAPSHOT from Ban payloads.
 */
export function requestBootstrap(
  store: NotificationRuntimeStore,
  args: { source: RuntimeSource; recovery?: boolean },
): BootstrapOutcome {
  const transitionId = nextRuntimeTransitionId(
    args.recovery ? 'recovery' : 'sync',
  );
  store.dispatch({
    type: args.recovery ? 'SYNC_RECOVERY_STARTED' : 'SYNC_STARTED',
    transitionId,
    source: args.source,
  });
  return { accepted: true, transitionId };
}

/**
 * Truthful Sync is not connected. Mark FAILED — do not apply fabricated items.
 */
export function completeBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    source: RuntimeSource;
    /** Ignored — Ban payloads cannot supply journal sequence/revision. */
    items?: unknown;
    userId?: string;
  },
): void {
  void args.items;
  void args.userId;
  store.dispatch({
    type: 'SYNC_FAILED',
    transitionId: args.transitionId,
    errorCode: 'AWAITING_TRUTHFUL_SYNC',
    source: args.source,
  });
}

export function failBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    errorCode: string;
    source: RuntimeSource;
  },
): void {
  store.dispatch({
    type: 'SYNC_FAILED',
    transitionId: args.transitionId,
    errorCode: args.errorCode,
    source: args.source,
  });
}

export function bootstrapIsInFlight(
  store: NotificationRuntimeStore,
): boolean {
  const s = store.getState().syncStatus;
  return s === 'SYNCING' || s === 'RECOVERING';
}
