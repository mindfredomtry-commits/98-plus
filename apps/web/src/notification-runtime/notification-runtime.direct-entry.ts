/**
 * Stage 7 Phase 1 — deeplink / live-single direct entry (ingest only).
 * Never activates presentation or application mode.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  selectHasDeferredDirectEntry,
  selectIsDirectEntry,
} from './notification-runtime.selectors';
import type {
  DirectEntrySource,
  DirectReturnPolicy,
  NotificationItem,
  NotificationItemKind,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type DirectEntryOutcome =
  | 'queued'
  | 'idle'
  | 'deferred'
  | 'failed'
  | 'rejected';

export type DirectItemTransport = (args: {
  targetId: string;
  targetKind: NotificationItemKind | null;
}) => Promise<NotificationItem>;

export function toDirectNotificationItem(
  kind: NotificationItemKind,
  payload: BanInteraction | BanResult,
): NotificationItem {
  if (kind === 'result') {
    return { kind: 'result', result: payload as BanResult };
  }
  if (kind === 'check') {
    return { kind: 'check', ban: payload as BanInteraction };
  }
  return { kind: 'incoming', ban: payload as BanInteraction };
}

/**
 * Begin direct entry. Fetches and enqueues; does not activate.
 */
export function requestDirectEntry(
  store: NotificationRuntimeStore,
  args: {
    targetId: string;
    targetKind?: NotificationItemKind | null;
    entrySource: DirectEntrySource;
    returnPolicy?: DirectReturnPolicy;
    defer?: boolean;
    transitionId?: string;
    source?: RuntimeSource;
    item?: NotificationItem | null;
  },
): {
  accepted: boolean;
  deferred: boolean;
  transitionId: string;
  outcome: DirectEntryOutcome;
  effects: RuntimeEffect[];
} {
  const transitionId =
    args.transitionId ?? nextRuntimeTransitionId('direct-entry');
  const source: RuntimeSource =
    args.source ??
    (args.entrySource === 'live-single' ? 'websocket' : 'deeplink');

  const before = store.getState();
  const duplicateSameId =
    before.directEntry.transitionId === transitionId ||
    (before.lifecycle.transitionId === transitionId &&
      before.lifecycle.status === 'recovering');

  const result = store.dispatch({
    type: 'DEEPLINK_ENTRY_REQUESTED',
    transitionId,
    targetId: args.targetId,
    targetKind: args.targetKind ?? null,
    entrySource: args.entrySource,
    returnPolicy: args.returnPolicy ?? 'retain_queue',
    defer: args.defer === true,
    source,
  });

  if (duplicateSameId) {
    return {
      accepted: false,
      deferred: false,
      transitionId,
      outcome: 'rejected',
      effects: result.effects,
    };
  }

  const state = store.getState();
  const deferred =
    selectHasDeferredDirectEntry(state) &&
    state.directEntry.deferred?.transitionId === transitionId;
  const accepted =
    (state.directEntry.active &&
      state.directEntry.transitionId === transitionId) ||
    deferred;

  if (deferred) {
    return {
      accepted,
      deferred: true,
      transitionId,
      outcome: 'deferred',
      effects: result.effects,
    };
  }

  if (
    !state.directEntry.active ||
    state.directEntry.transitionId !== transitionId
  ) {
    return {
      accepted: true,
      deferred: false,
      transitionId,
      outcome: 'idle',
      effects: result.effects,
    };
  }

  if (args.item) {
    applyDirectItemReceived(store, {
      transitionId,
      item: args.item,
      source,
    });
    return {
      accepted: true,
      deferred: false,
      transitionId,
      outcome: 'queued',
      effects: result.effects,
    };
  }

  return {
    accepted: true,
    deferred: false,
    transitionId,
    outcome: 'queued',
    effects: result.effects,
  };
}

export function applyDirectItemReceived(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    item: NotificationItem;
    source?: RuntimeSource;
  },
): DirectEntryOutcome {
  store.dispatch({
    type: 'DIRECT_ITEM_RECEIVED',
    transitionId: args.transitionId,
    item: args.item,
    source: args.source ?? 'deeplink',
  });
  return 'queued';
}

export function applyDirectItemFailed(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    errorCode?: string;
    source?: RuntimeSource;
  },
): DirectEntryOutcome {
  store.dispatch({
    type: 'DIRECT_ITEM_FAILED',
    transitionId: args.transitionId,
    errorCode: args.errorCode ?? 'DIRECT_FETCH_FAILED',
    source: args.source ?? 'deeplink',
  });
  return 'failed';
}

export async function executeFetchDirectItemEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'FETCH_DIRECT_ITEM' }>,
  fetchItem: DirectItemTransport,
): Promise<DirectEntryOutcome> {
  try {
    const item = await fetchItem({
      targetId: effect.targetId,
      targetKind: effect.targetKind,
    });
    return applyDirectItemReceived(store, {
      transitionId: effect.transitionId,
      item,
      source: effect.source,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'DIRECT_FETCH_FAILED';
    return applyDirectItemFailed(store, {
      transitionId: effect.transitionId,
      errorCode: message,
      source: effect.source,
    });
  }
}

export function flushDeferredDirectEntry(
  store: NotificationRuntimeStore,
  source: RuntimeSource = 'system',
): RuntimeEffect[] {
  const result = store.dispatch({
    type: 'DIRECT_ENTRY_FLUSH_REQUESTED',
    source,
  });
  return result.effects;
}

export { notificationItemId, selectIsDirectEntry };
