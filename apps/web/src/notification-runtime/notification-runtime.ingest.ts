/**
 * Stage 8 Phase 8 — ingest via temporary adapter → APPLY_DELTA / SNAPSHOT.
 * No items.queue writers.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { NotificationRuntimeStore } from './notification-runtime.store';
import { nextRuntimeTransitionId } from './notification-runtime.store';
import {
  buildSnapshotFromLegacyItems,
  buildUpsertDeltaFromLegacyItem,
  itemFromCheck,
  itemFromIncoming,
  itemFromResult,
} from './notification-runtime.temporary-adapter';
import type {
  NotificationItem,
  RuntimeSource,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';

export type ReceiveNotificationItemArgs = {
  item: NotificationItem;
  source: RuntimeSource;
  userId: string;
  transitionId?: string;
  /** Causal NEXT_IN_SESSION when result follows overboard. */
  causedByItemId?: string;
};

export function receiveNotificationItem(
  store: NotificationRuntimeStore,
  args: ReceiveNotificationItemArgs,
): void {
  const state = store.getState();
  const fromRevision = state.revision;
  if (fromRevision == null) {
    // No baseline yet — apply as single-item snapshot
    const { snapshot, presentationByItemId } = buildSnapshotFromLegacyItems({
      items: [args.item],
      userId: args.userId,
      priorRevision: null,
    });
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: args.transitionId ?? nextRuntimeTransitionId('ingest'),
      snapshot,
      presentationByItemId,
      source: args.source,
    });
    return;
  }
  const { delta, presentationByItemId } = buildUpsertDeltaFromLegacyItem({
    item: args.item,
    userId: args.userId,
    fromRevision,
    causedByItemId: args.causedByItemId,
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: args.transitionId ?? nextRuntimeTransitionId('ingest'),
    delta,
    presentationByItemId,
    source: args.source,
  });
}

export function receiveNotificationItems(
  store: NotificationRuntimeStore,
  args: {
    items: NotificationItem[];
    source: RuntimeSource;
    userId: string;
    transitionId?: string;
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
    transitionId: args.transitionId ?? nextRuntimeTransitionId('ingest'),
    snapshot,
    presentationByItemId,
    source: args.source,
  });
}

/** Complete identity: REMOVE prior kind for ban via authorized path only from actions. */
export function completeNotificationIdentity(
  store: NotificationRuntimeStore,
  args: {
    banId: string;
    kinds: Array<'incoming' | 'check'>;
    source: RuntimeSource;
    userId: string;
  },
): void {
  const state = store.getState();
  if (state.revision == null) return;
  // Passive complete without action auth — only remove if not active
  for (const kind of args.kinds) {
    const itemId = `${kind}:${args.banId}`;
    if (state.activeItemId === itemId) continue;
    if (!state.itemsById[itemId]) continue;
    const fromRevision = store.getState().revision!;
    const rev = (BigInt(fromRevision) + BigInt(1)).toString();
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_DELTA_V1',
      transitionId: nextRuntimeTransitionId('complete'),
      delta: {
        type: 'DELTA',
        fromRevision,
        revision: rev,
        operations: [{ type: 'REMOVE_ITEM', revision: rev, itemId }],
      },
      source: args.source,
    });
  }
}

export {
  itemFromIncoming,
  itemFromCheck,
  itemFromResult,
  notificationItemId,
};

export function pendingIdForItem(item: NotificationItem): string {
  return notificationItemId(item);
}

export type { BanInteraction, BanResult };
