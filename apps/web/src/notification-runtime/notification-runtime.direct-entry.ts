/**
 * Vertical 6 — deeplink / live-single direct entry (runtime sole owner).
 * Transport fetch only; queue/display/lobby decided by reducer.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { OwnerActiveDisplayPatch } from '@/notification-runtime/notification-runtime.display-patch';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  buildExclusiveDisplayPatchFromRuntime,
  type RuntimeLegacySinks,
} from './notification-runtime.production-advance';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  selectHasDeferredDirectEntry,
  selectIsDirectEntry,
  selectLobbyMayShow,
  selectOverlayVisible,
} from './notification-runtime.selectors';
import { projectRuntimeQueueToLegacy } from './notification-runtime.adapters';
import type {
  DirectEntrySource,
  DirectReturnPolicy,
  NotificationItem,
  NotificationItemKind,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type DirectEntryOutcome =
  | 'showing'
  | 'idle'
  | 'deferred'
  | 'failed'
  | 'rejected';

export type DirectItemTransport = (args: {
  targetId: string;
  targetKind: NotificationItemKind | null;
}) => Promise<NotificationItem>;

function projectAfterDirect(
  store: NotificationRuntimeStore,
  sinks: RuntimeLegacySinks,
  source: string,
): void {
  const state = store.getState();
  sinks.writeQueue(
    projectRuntimeQueueToLegacy(state),
    `v6-direct-entry:${source}`,
  );
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(state),
    `v6-direct-entry-display:${source}`,
  );
  sinks.runEffects?.(store.getLastEffects());
}

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
 * Begin direct entry. Duplicate transitionId → rejected (store no-op).
 * Host must set `defer` when SUCCESS / compose / product-exclusive is active.
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
    /** When item already known (live), materialize immediately after request. */
    item?: NotificationItem | null;
  },
  sinks?: RuntimeLegacySinks,
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
    returnPolicy: args.returnPolicy ?? 'lobby_after_card',
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
    // Consumed → idle lobby path
    if (selectLobbyMayShow(state)) {
      sinks && projectAfterDirect(store, sinks, 'consumed-or-idle');
      return {
        accepted: true,
        deferred: false,
        transitionId,
        outcome: 'idle',
        effects: result.effects,
      };
    }
    return {
      accepted: false,
      deferred: false,
      transitionId,
      outcome: 'rejected',
      effects: result.effects,
    };
  }

  // Item already available — materialize without waiting for transport.
  if (args.item) {
    const mid = applyDirectItemReceived(
      store,
      { transitionId, item: args.item, source },
      sinks,
    );
    return {
      accepted: true,
      deferred: false,
      transitionId,
      outcome: mid,
      effects: store.getLastEffects(),
    };
  }

  return {
    accepted: true,
    deferred: false,
    transitionId,
    outcome: state.lifecycle.status === 'recovering' ? 'deferred' : 'showing',
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
  sinks?: RuntimeLegacySinks,
): DirectEntryOutcome {
  store.dispatch({
    type: 'DIRECT_ITEM_RECEIVED',
    transitionId: args.transitionId,
    item: args.item,
    source: args.source ?? 'deeplink',
  });
  sinks && projectAfterDirect(store, sinks, 'item-received');
  const state = store.getState();
  if (selectOverlayVisible(state) && selectIsDirectEntry(state)) {
    return 'showing';
  }
  if (selectLobbyMayShow(state)) return 'idle';
  return 'rejected';
}

export function failDirectItem(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    errorCode: string;
    source?: RuntimeSource;
  },
  sinks?: RuntimeLegacySinks,
): DirectEntryOutcome {
  store.dispatch({
    type: 'DIRECT_ITEM_FAILED',
    transitionId: args.transitionId,
    errorCode: args.errorCode,
    source: args.source ?? 'deeplink',
  });
  sinks && projectAfterDirect(store, sinks, 'item-failed');
  return selectLobbyMayShow(store.getState()) ? 'failed' : 'rejected';
}

/**
 * Run FETCH_DIRECT_ITEM transport; host supplies fetch fn.
 * Does not decide lobby/queue — only dispatches received/failed.
 */
export async function executeFetchDirectItemEffect(
  store: NotificationRuntimeStore,
  effect: Extract<RuntimeEffect, { type: 'FETCH_DIRECT_ITEM' }>,
  fetchItem: DirectItemTransport,
  sinks?: RuntimeLegacySinks,
): Promise<DirectEntryOutcome> {
  try {
    const item = await fetchItem({
      targetId: effect.targetId,
      targetKind: effect.targetKind,
    });
    if (store.getState().directEntry.transitionId !== effect.transitionId) {
      return 'rejected';
    }
    return applyDirectItemReceived(
      store,
      {
        transitionId: effect.transitionId,
        item,
        source: effect.source,
      },
      sinks,
    );
  } catch (err) {
    const code =
      err instanceof Error && err.message
        ? err.message.slice(0, 64)
        : 'DIRECT_FETCH_FAILED';
    return failDirectItem(
      store,
      { transitionId: effect.transitionId, errorCode: code, source: effect.source },
      sinks,
    );
  }
}

/** After SUCCESS drain / compose end — start deferred direct if any. */
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

export function completeDirectSessionViaDismiss(
  store: NotificationRuntimeStore,
  args: {
    targetItemId: string;
    reason?:
      | 'user_dismiss'
      | 'go_to_bans'
      | 'close_result'
      | 'continue_chain'
      | 'system';
    source?: RuntimeSource;
  },
  sinks?: RuntimeLegacySinks,
): { lobbyMayShow: boolean; pendingIds: string[] } {
  store.dispatch({
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: nextRuntimeTransitionId('direct-dismiss'),
    targetItemId: args.targetItemId,
    reason: args.reason ?? 'user_dismiss',
    source: args.source ?? 'user',
  });
  sinks && projectAfterDirect(store, sinks, 'direct-dismiss');
  const state = store.getState();
  return {
    lobbyMayShow: selectLobbyMayShow(state),
    pendingIds: state.pending.itemIds,
  };
}

export type DirectEntryLegacySinks = {
  writeQueue: (queue: QueuedOverlay[], source: string) => void;
  writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
};

export { notificationItemId, selectIsDirectEntry, selectLobbyMayShow };
