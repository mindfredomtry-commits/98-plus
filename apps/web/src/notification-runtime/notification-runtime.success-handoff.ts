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

/**
 * SUCCESS handoff `fetchPendingItems` must consume transport payloads directly.
 *
 * Never rebuild from `overlayQueueRef` / `pendingStartupInteractionsRef` after
 * `commitPendingQueueViaOwner([])` may have cleared them — that discarded the
 * fetch result and forced Lobby even when transport returned B.
 */
export function resolveSuccessHandoffFetchItems(
  transportItems: readonly QueuedOverlay[],
): QueuedOverlay[] {
  return transportItems.slice();
}

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
  try {
    return await materializeSuccessHandoff(store, args, sinks);
  } finally {
    // A drain this transition still owns must never outlive the handoff:
    // lifecycle=draining keeps overlay authority on, which hides interactive
    // lobby chrome and blocks «Твои запреты» navigation.
    normalizeAbandonedDrain(store, args.transitionId, sinks);
  }
}

/**
 * Return the runtime to idle when this transition still owns a drain that
 * produced no display. No-op once another owner took over the lifecycle.
 *
 * `transitionId` null means "whatever drain is currently owned" — used by the
 * host when a handoff ends without ever reaching materialize.
 */
export function normalizeAbandonedDrain(
  store: NotificationRuntimeStore,
  transitionId: string | null,
  sinks: RuntimeLegacySinks,
): boolean {
  const state = store.getState();
  const owned = transitionId ?? state.lifecycle.transitionId;
  if (
    !owned ||
    state.lifecycle.status !== 'draining' ||
    state.lifecycle.transitionId !== owned
  ) {
    return false;
  }
  store.dispatch({
    type: 'RUNTIME_NORMALIZE_IDLE',
    transitionId: owned,
    reason: 'success-handoff-abandoned-drain',
    source: 'user',
  });
  projectAfterHandoff(store, sinks, 'normalize-idle');
  return true;
}

async function materializeSuccessHandoff(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    localItems: readonly QueuedOverlay[];
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

  // Never wipe an existing runtime queue with an empty replace (Vertical 9 mirrors
  // are often empty while runtime still holds continuation items).
  if (sorted.length === 0) {
    const existing = store.getState().items.queue;
    if (existing.length > 0) {
      sorted = sortQueuedForSuccessDrain(
        filterConsumedQueuedItems(
          store,
          existing.map((item) => {
            if (item.kind === 'result') {
              return { kind: 'result' as const, result: item.result };
            }
            if (item.kind === 'check') {
              return { kind: 'check' as const, ban: item.ban };
            }
            return { kind: 'incoming' as const, ban: item.ban };
          }),
        ),
      );
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
