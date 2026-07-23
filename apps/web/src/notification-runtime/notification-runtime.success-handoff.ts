/**
 * Vertical 5 — SUCCESS handoff: runtime sole drain/materialize owner.
 * Prefetch is transport only (returns items or failure); never decides lobby/showNext.
 */
import { mergeStartupPendingChain } from '@/lib/overlay-arbiter';
import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';
import {
  buildExclusiveDisplayPatchFromRuntime,
  toQueuedOverlayItems,
  type RuntimeLegacySinks,
} from './notification-runtime.production-advance';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  selectIsDraining,
  selectLobbyMayShow,
  selectOverlayVisible,
} from './notification-runtime.selectors';
import { projectRuntimeQueueToLegacy } from './notification-runtime.adapters';
import type { RuntimeSource } from './notification-runtime.types';

export type SuccessHandoffOutcome = 'showing' | 'idle' | 'failed' | 'rejected';

/** Product ordering: timestamp DESC, tie result > check > incoming. */
export function sortQueuedForSuccessDrain(
  items: readonly QueuedOverlay[],
): QueuedOverlay[] {
  return mergeStartupPendingChain([], items);
}

export function filterConsumedQueuedItems(
  store: NotificationRuntimeStore,
  items: readonly QueuedOverlay[],
): QueuedOverlay[] {
  const consumed = new Set(store.getState().consumed.itemIds);
  return items.filter((item) => !consumed.has(overlayQueueKey(item)));
}

/**
 * Begin SUCCESS handoff — enters lifecycle=draining.
 * Duplicate transitionId is a no-op (store + reducer).
 */
export function requestSuccessHandoff(
  store: NotificationRuntimeStore,
  args?: { transitionId?: string; source?: RuntimeSource },
): {
  accepted: boolean;
  transitionId: string;
  effects: ReturnType<NotificationRuntimeStore['dispatch']>['effects'];
} {
  const transitionId =
    args?.transitionId ?? nextRuntimeTransitionId('success-handoff');
  const before = store.getState();
  const duplicateSameId =
    before.lifecycle.status === 'draining' &&
    before.lifecycle.transitionId === transitionId;
  const result = store.dispatch({
    type: 'SUCCESS_HANDOFF_REQUESTED',
    transitionId,
    source: args?.source ?? 'user',
  });
  const accepted =
    !duplicateSameId &&
    selectIsDraining(store.getState()) &&
    store.getState().lifecycle.transitionId === transitionId;
  return { accepted, transitionId, effects: result.effects };
}

function projectAfterHandoff(
  store: NotificationRuntimeStore,
  sinks: RuntimeLegacySinks,
  source: string,
): void {
  const state = store.getState();
  sinks.writeQueue(
    projectRuntimeQueueToLegacy(state),
    `v5-success-handoff:${source}`,
  );
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(state),
    `v5-success-handoff-display:${source}`,
  );
  sinks.runEffects?.(store.getLastEffects());
}

/**
 * Materialize local and/or fetched items into runtime queue while draining.
 * Prefetch callback is transport-only: returns payloads or throws.
 */
export async function executeSuccessHandoffMaterialize(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    localItems: readonly QueuedOverlay[];
    /** Transport: fetch pending payloads when local empty. */
    fetchPendingItems?: () => Promise<QueuedOverlay[]>;
  },
  sinks: RuntimeLegacySinks,
): Promise<SuccessHandoffOutcome> {
  const { transitionId } = args;
  if (
    !selectIsDraining(store.getState()) ||
    store.getState().lifecycle.transitionId !== transitionId
  ) {
    return 'rejected';
  }

  let sorted = sortQueuedForSuccessDrain(
    filterConsumedQueuedItems(store, args.localItems),
  );

  if (sorted.length === 0 && args.fetchPendingItems) {
    try {
      const fetched = await args.fetchPendingItems();
      if (
        store.getState().lifecycle.transitionId !== transitionId ||
        !selectIsDraining(store.getState())
      ) {
        return 'rejected';
      }
      sorted = sortQueuedForSuccessDrain(
        filterConsumedQueuedItems(store, fetched),
      );
    } catch {
      store.dispatch({
        type: 'DRAIN_FAILED',
        transitionId,
        errorCode: 'SUCCESS_HANDOFF_FETCH_FAILED',
        source: 'user',
      });
      projectAfterHandoff(store, sinks, 'drain-failed');
      return 'failed';
    }
  }

  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId,
    items: toQueuedOverlayItems(sorted),
    replaceQueue: true,
    source: 'user',
  });
  projectAfterHandoff(store, sinks, sorted.length > 0 ? 'show-head' : 'empty');

  const state = store.getState();
  if (selectOverlayVisible(state) && state.lifecycle.status === 'showing') {
    return 'showing';
  }
  if (selectLobbyMayShow(state)) {
    return 'idle';
  }
  return state.lifecycle.status === 'idle' ? 'idle' : 'rejected';
}

export function successHandoffHeadBanId(
  store: NotificationRuntimeStore,
): string | null {
  const head = store.getState().items.queue[0];
  if (!head) return null;
  return notificationItemId(head).split(':')[1] ?? null;
}
