/**
 * Stage 8 Phase 8 — sync start / apply via temporary adapter (no queue clear).
 */
import type { NotificationRuntimeStore } from './notification-runtime.store';
import { nextRuntimeTransitionId } from './notification-runtime.store';
import { buildSnapshotFromLegacyItems } from './notification-runtime.temporary-adapter';
import type {
  NotificationItem,
  RuntimeSource,
} from './notification-runtime.types';

export type BootstrapOutcome = {
  accepted: boolean;
  transitionId: string;
};

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

export function completeBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    items: NotificationItem[];
    userId: string;
    source: RuntimeSource;
  },
): void {
  const prior = store.getState().revision;
  const { snapshot, presentationByItemId } = buildSnapshotFromLegacyItems({
    items: args.items,
    userId: args.userId,
    priorRevision: prior,
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: args.transitionId,
    snapshot,
    presentationByItemId,
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
