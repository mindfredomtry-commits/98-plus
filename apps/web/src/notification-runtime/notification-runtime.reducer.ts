/**
 * Stage 7 Phase 2 — pure passive notification runtime reducer.
 * Deterministic: no Date.now / random / API / React.
 */
import {
  createEmptyDirectEntryState,
  createInitialNotificationRuntimeState,
  notificationItemId,
  type DeferredDirectEntry,
  type NotificationItem,
  type NotificationRuntimeEvent,
  type NotificationRuntimeReducerResult,
  type NotificationRuntimeState,
  type RuntimeEffect,
} from './notification-runtime.types';
import { selectCurrentItem, selectCurrentItemId } from './notification-runtime.selectors';
import { decidePendingSnapshotApply } from './notification-runtime.pending-refresh-ordering';
import { evaluateStaleReplaceGuard } from './notification-runtime.stale-replace-guard';

function cloneState(state: NotificationRuntimeState): NotificationRuntimeState {
  return {
    lifecycle: { ...state.lifecycle },
    items: { queue: [...state.items.queue] },
    activation: { ...state.activation },
    action: { ...state.action },
    pending: {
      itemIds: [...state.pending.itemIds],
      sourceVersion: state.pending.sourceVersion,
      generation: state.pending.generation,
    },
    consumed: { itemIds: [...state.consumed.itemIds] },
    recovery: { ...state.recovery },
    directEntry: {
      ...state.directEntry,
      deferred: state.directEntry.deferred
        ? { ...state.directEntry.deferred }
        : null,
    },
  };
}

function clearAction(
  state: NotificationRuntimeState,
): NotificationRuntimeState {
  return {
    ...state,
    action: {
      status: 'idle',
      commandId: null,
      targetItemId: null,
      errorCode: null,
    },
  };
}

/**
 * Keep an active claim stable across queue reconcile.
 * Never invent activation; never silently drop an active item.
 */
function preserveActiveItemInQueue(
  activation: NotificationRuntimeState['activation'],
  previousQueue: NotificationItem[],
  nextQueue: NotificationItem[],
): NotificationItem[] {
  if (activation.type !== 'ACTIVE') return nextQueue;
  const activeId = activation.itemId;
  if (nextQueue.some((item) => notificationItemId(item) === activeId)) {
    return nextQueue;
  }
  const previous = previousQueue.find(
    (item) => notificationItemId(item) === activeId,
  );
  if (!previous) return nextQueue;
  return [
    previous,
    ...nextQueue.filter((item) => notificationItemId(item) !== activeId),
  ];
}

function dedupeAppend(
  queue: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const seen = new Set(queue.map(notificationItemId));
  const next = [...queue];
  for (const item of incoming) {
    const id = notificationItemId(item);
    // Reject empty ids (e.g. "incoming:")
    if (!id.includes(':') || id.endsWith(':') || seen.has(id)) continue;
    seen.add(id);
    next.push(item);
  }
  return next;
}

function addConsumed(
  state: NotificationRuntimeState,
  itemId: string,
): NotificationRuntimeState {
  if (state.consumed.itemIds.includes(itemId)) {
    // Still strip from pending if a prior path left overlap.
    const pendingIds = reconcilePending(
      state.pending.itemIds,
      state.consumed.itemIds,
    );
    if (pendingIds.length === state.pending.itemIds.length) return state;
    return {
      ...state,
      pending: { ...state.pending, itemIds: pendingIds },
    };
  }
  const consumedIds = [...state.consumed.itemIds, itemId];
  return {
    ...state,
    consumed: { itemIds: consumedIds },
    pending: {
      ...state.pending,
      itemIds: reconcilePending(state.pending.itemIds, consumedIds),
    },
  };
}

/**
 * Pending authority rule for snapshot replacements (Stage 6B Phase 5).
 *
 * Both empty and non-empty stamped results older than the applied generation
 * are rejected. Empty current-authority clears only when the runtime does not
 * still hold a live/queued item the server has not caught up with.
 */
function resolvePendingReplacement(
  base: NotificationRuntimeState,
  incomingIds: string[],
  sourceVersion: string | null,
  generation: number | null | undefined,
): NotificationRuntimeState['pending'] {
  const decision = decidePendingSnapshotApply({
    currentGeneration: base.pending.generation,
    currentItemIds: base.pending.itemIds,
    currentSourceVersion: base.pending.sourceVersion,
    incomingIds,
    incomingSourceVersion: sourceVersion,
    stamped: generation,
    holdsLocalItem: base.items.queue.length > 0,
  });
  if (decision.action === 'reject') {
    return base.pending;
  }
  if (decision.action === 'hold-local-empty') {
    return {
      ...base.pending,
      generation: decision.nextGeneration,
    };
  }
  return {
    itemIds: decision.itemIds,
    sourceVersion: decision.sourceVersion,
    generation: decision.nextGeneration,
  };
}

function reconcilePending(
  pendingIds: string[],
  consumedIds: readonly string[],
): string[] {
  const consumed = new Set(consumedIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of pendingIds) {
    if (consumed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Stage 7 Phase 2 — complete/consume head only.
 * Does not activate the next item (no application surface claim).
 * Clears activation when the completed item was the active claim.
 */
function dismissHead(
  state: NotificationRuntimeState,
  targetItemId: string,
  transitionId: string,
  source: NotificationRuntimeState['lifecycle']['source'],
): NotificationRuntimeReducerResult {
  void transitionId;
  const head = selectCurrentItem(state);
  const headId = selectCurrentItemId(state);
  if (!head || headId !== targetItemId) {
    return { state, effects: [] };
  }

  const remaining = state.items.queue.slice(1);
  let next = addConsumed(
    {
      ...state,
      items: { queue: remaining },
      activation:
        state.activation.type === 'ACTIVE' &&
        state.activation.itemId === targetItemId
          ? { type: 'INACTIVE' as const }
          : state.activation,
    },
    targetItemId,
  );

  const effects: RuntimeEffect[] = [
    { type: 'MARK_CONSUMED', itemId: targetItemId },
  ];

  next = {
    ...clearAction(next),
    lifecycle: {
      status: 'idle',
      source,
      transitionId: null,
    },
    directEntry: {
      ...createEmptyDirectEntryState(),
      deferred: state.directEntry.deferred,
    },
  };
  effects.push({
    type: 'REFRESH_PENDING',
    reason: remaining.length > 0 ? 'item-completed' : 'queue-completed',
  });
  return { state: next, effects };
}

function completeItemById(
  state: NotificationRuntimeState,
  targetItemId: string,
  transitionId: string,
  source: NotificationRuntimeState['lifecycle']['source'],
): NotificationRuntimeReducerResult {
  const index = state.items.queue.findIndex(
    (item) => notificationItemId(item) === targetItemId,
  );
  if (index < 0) {
    return { state, effects: [] };
  }
  if (index === 0) {
    return dismissHead(state, targetItemId, transitionId, source);
  }

  const queue = state.items.queue.filter((_, itemIndex) => itemIndex !== index);
  const next = addConsumed(
    {
      ...state,
      items: { queue },
      activation:
        state.activation.type === 'ACTIVE' &&
        state.activation.itemId === targetItemId
          ? { type: 'INACTIVE' as const }
          : state.activation,
    },
    targetItemId,
  );
  return {
    state: next,
    effects: [{ type: 'MARK_CONSUMED', itemId: targetItemId }],
  };
}

function targetItemIdFromKind(
  targetId: string,
  targetKind: NotificationItem['kind'] | null | undefined,
): string {
  const id = String(targetId).trim();
  if (!id) return '';
  if (targetKind === 'check') return `check:${id}`;
  if (targetKind === 'result') return `result:${id}`;
  if (targetKind === 'incoming') return `incoming:${id}`;
  // Unknown kind — match any consumed suffix for this ban id.
  return id;
}

function isTargetConsumed(
  state: NotificationRuntimeState,
  targetId: string,
  targetKind: NotificationItem['kind'] | null | undefined,
): boolean {
  const exact = targetItemIdFromKind(targetId, targetKind);
  if (exact.includes(':') && state.consumed.itemIds.includes(exact)) {
    return true;
  }
  const id = String(targetId).trim();
  if (!id) return false;
  return state.consumed.itemIds.some((c) => c.endsWith(`:${id}`));
}

function buildDeferred(
  transitionId: string,
  targetId: string,
  targetKind: NotificationItem['kind'] | null | undefined,
  entrySource: DeferredDirectEntry['entrySource'],
  returnPolicy: DeferredDirectEntry['returnPolicy'],
): DeferredDirectEntry {
  return {
    transitionId,
    targetId: String(targetId).trim(),
    targetKind: targetKind ?? null,
    entrySource,
    returnPolicy,
  };
}

export function notificationRuntimeReducer(
  state: NotificationRuntimeState,
  event: NotificationRuntimeEvent,
): NotificationRuntimeReducerResult {
  let base = cloneState(state);
  const effects: RuntimeEffect[] = [];

  switch (event.type) {
    case 'RESET_REQUESTED': {
      return {
        state: createInitialNotificationRuntimeState(),
        effects: [],
      };
    }

    case 'BOOTSTRAP_REQUESTED': {
      // Deeplink / direct entry outranks boot snapshot.
      const preserveDirect =
        base.directEntry.active || base.directEntry.deferred != null;

      if (preserveDirect) {
        return {
          state: {
            ...base,
            recovery: {
              status: 'loading',
              snapshotVersion: null,
              transitionId: event.transitionId,
            },
          },
          effects: [
            {
              type: 'FETCH_PENDING',
              transitionId: event.transitionId,
              source: event.source,
            },
          ],
        };
      }

      // Fresh boot: drop mid-flight action/queue/activation; keep consumed TTL.
      return {
        state: {
          ...clearAction(base),
          items: { queue: [] },
          activation: { type: 'INACTIVE' },
          pending: {
            itemIds: [],
            sourceVersion: null,
            generation: base.pending.generation,
          },
          lifecycle: {
            status: 'booting',
            source: event.source,
            transitionId: event.transitionId,
          },
          recovery: {
            status: 'loading',
            snapshotVersion: null,
            transitionId: event.transitionId,
          },
          directEntry: createEmptyDirectEntryState(),
        },
        effects: [
          {
            type: 'FETCH_PENDING',
            transitionId: event.transitionId,
            source: event.source,
          },
        ],
      };
    }


    case 'ITEMS_RECEIVED': {
      // Stage 7 Phase 2 — enqueue/dedupe only. Never activate / claim surface.
      if (event.replaceQueue) {
        const rejected = evaluateStaleReplaceGuard(base, {
          replaceQueue: true,
          items: event.items,
          transitionId: event.transitionId,
        });
        if (rejected) {
          return { state, effects: [] };
        }
      }

      const queue = preserveActiveItemInQueue(
        base.activation,
        base.items.queue,
        event.replaceQueue
          ? dedupeAppend([], event.items)
          : dedupeAppend(base.items.queue, event.items),
      );

      const next: NotificationRuntimeState = {
        ...clearAction(base),
        items: { queue },
        activation: base.activation,
        lifecycle: {
          status:
            base.lifecycle.status === 'booting' ||
            base.lifecycle.status === 'recovering' ||
            base.lifecycle.status === 'submitting'
              ? base.lifecycle.status
              : 'idle',
          source: event.source,
          transitionId:
            base.lifecycle.status === 'booting' ||
            base.lifecycle.status === 'recovering' ||
            base.lifecycle.status === 'submitting'
              ? base.lifecycle.transitionId
              : null,
        },
      };

      return { state: next, effects };
    }

    case 'BOOTSTRAP_SNAPSHOT_RECEIVED':
    case 'BOOTSTRAP_COMPLETED': {
      // Stage 6B Phase 4: only an in-flight boot/recovery may complete.
      const inFlight =
        base.recovery.status === 'loading' ||
        base.lifecycle.status === 'booting' ||
        base.lifecycle.status === 'recovering';
      if (!inFlight) {
        return { state: base, effects: [] };
      }
      const expectedTid =
        base.recovery.transitionId ?? base.lifecycle.transitionId;
      if (expectedTid && expectedTid !== event.transitionId) {
        // Stale bootstrap response — ignore.
        return { state: base, effects: [] };
      }

      const preserveDirect =
        base.directEntry.active || base.directEntry.deferred != null;

      const extraConsumed = event.consumedItemIds ?? [];
      let consumedIds = [...base.consumed.itemIds];
      for (const id of extraConsumed) {
        if (id && !consumedIds.includes(id)) consumedIds.push(id);
      }

      const pendingIds = reconcilePending(event.pendingItemIds, consumedIds);

      if (preserveDirect) {
        // Active direct fetch: refresh pending/consumed only; do not replace queue.
        return {
          state: {
            ...base,
            pending: resolvePendingReplacement(
              base,
              pendingIds,
              event.sourceVersion,
              event.generation ?? null,
            ),
            consumed: { itemIds: consumedIds },
            recovery: {
              status: 'applied',
              snapshotVersion: event.sourceVersion,
              transitionId: null,
            },
          },
          effects,
        };
      }

      const filteredItems = event.items.filter(
        (item) => !consumedIds.includes(notificationItemId(item)),
      );
      // Stage 7 Phase 2 — always populate FIFO; never activate.
      const queue = preserveActiveItemInQueue(
        base.activation,
        base.items.queue,
        dedupeAppend([], filteredItems),
      );

      const next: NotificationRuntimeState = {
        ...clearAction(base),
        items: { queue },
        activation: base.activation,
        pending: resolvePendingReplacement(
          base,
          pendingIds,
          event.sourceVersion,
          event.generation ?? null,
        ),
        consumed: { itemIds: consumedIds },
        recovery: {
          status: 'applied',
          snapshotVersion: event.sourceVersion,
          transitionId: null,
        },
        lifecycle: {
          status: 'idle',
          source: event.source,
          transitionId: null,
        },
      };

      return { state: next, effects };
    }

    case 'BOOTSTRAP_FAILED': {
      const expectedTid =
        base.recovery.transitionId ?? base.lifecycle.transitionId;
      if (expectedTid && expectedTid !== event.transitionId) {
        return { state: base, effects: [] };
      }

      const preserveDirect =
        base.directEntry.active ||
        base.directEntry.deferred != null;

      if (preserveDirect) {
        return {
          state: {
            ...base,
            recovery: {
              status: 'failed',
              snapshotVersion: base.recovery.snapshotVersion,
              transitionId: null,
            },
          },
          effects: [],
        };
      }

      return {
        state: {
          ...clearAction(base),
          items: { queue: [] },
          activation: { type: 'INACTIVE' },
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
          recovery: {
            status: 'failed',
            snapshotVersion: base.recovery.snapshotVersion,
            transitionId: null,
          },
        },
        effects: [],
      };
    }

    case 'CARD_ACTION_REQUESTED': {
      const current = selectCurrentItem(base);
      const currentId = selectCurrentItemId(base);
      if (!current || !currentId || currentId !== event.targetItemId) {
        return { state: base, effects: [] };
      }
      // Stage 7 Phase 2 — actions run against ready queue head (no surface claim required).
      if (base.lifecycle.status === 'submitting') {
        return { state: base, effects: [] };
      }
      if (
        base.action.status === 'pending' ||
        base.action.status === 'succeeded'
      ) {
        return { state: base, effects: [] };
      }
      const actionOk =
        (event.action === 'check_answer' && current.kind === 'check') ||
        (event.action === 'incoming_overboard' && current.kind === 'incoming');
      if (!actionOk) {
        return { state: base, effects: [] };
      }
      const next: NotificationRuntimeState = {
        ...base,
        lifecycle: {
          status: 'submitting',
          source: event.source,
          transitionId: base.lifecycle.transitionId,
        },
        action: {
          status: 'pending',
          commandId: event.commandId,
          targetItemId: event.targetItemId,
          errorCode: null,
        },
      };
      return {
        state: next,
        effects: [
          {
            type: 'SUBMIT_CARD_ACTION',
            commandId: event.commandId,
            targetItemId: event.targetItemId,
            action: event.action,
            completed: event.completed,
          },
        ],
      };
    }

    case 'CARD_ACTION_SUCCEEDED': {
      if (
        base.action.commandId !== event.commandId ||
        base.action.targetItemId !== event.targetItemId
      ) {
        return { state: base, effects: [] };
      }

      let next = cloneState(base);
      const headId = selectCurrentItemId(next);

      if (event.replacement && headId === event.targetItemId) {
        // Item lifecycle: atomic head replacement (e.g. check→result). No surface claim.
        const replacementId = notificationItemId(event.replacement);
        next = {
          ...clearAction(next),
          items: {
            queue: [event.replacement, ...next.items.queue.slice(1)],
          },
          activation:
            next.activation.type === 'ACTIVE' &&
            next.activation.itemId === event.targetItemId
              ? { type: 'ACTIVE' as const, itemId: replacementId }
              : next.activation,
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        };
        next = addConsumed(next, event.targetItemId);
        effects.push({ type: 'MARK_CONSUMED', itemId: event.targetItemId });
        return { state: next, effects };
      }

      if (event.consumeAndAdvance && headId === event.targetItemId) {
        return dismissHead(
          next,
          event.targetItemId,
          next.lifecycle.transitionId ?? event.commandId,
          event.source,
        );
      }

      next = {
        ...next,
        lifecycle: {
          status: 'idle',
          source: event.source,
          transitionId: null,
        },
        action: {
          status: 'succeeded',
          commandId: event.commandId,
          targetItemId: event.targetItemId,
          errorCode: null,
        },
      };
      return { state: next, effects };
    }

    case 'CARD_ACTION_FAILED': {
      if (
        base.action.commandId !== event.commandId ||
        base.action.targetItemId !== event.targetItemId
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
          action: {
            status: 'failed',
            commandId: event.commandId,
            targetItemId: event.targetItemId,
            errorCode: event.errorCode,
          },
        },
        effects: [],
      };
    }

    case 'CARD_DISMISS_REQUESTED': {
      return dismissHead(
        base,
        event.targetItemId,
        event.transitionId,
        event.source,
      );
    }

    case 'ITEM_COMPLETED': {
      if (
        !base.items.queue.some(
          (item) => notificationItemId(item) === event.targetItemId,
        )
      ) {
        return { state, effects: [] };
      }
      return completeItemById(
        base,
        event.targetItemId,
        event.transitionId,
        event.source,
      );
    }

    case 'PENDING_SOURCE_UPDATED': {
      // Snapshot replace: dedupe; strip already-consumed from stored pending
      // (tombstones stay in consumed — late refresh cannot resurrect).
      const pendingIds = reconcilePending(
        event.itemIds,
        base.consumed.itemIds,
      );
      const nextPending = resolvePendingReplacement(
        base,
        pendingIds,
        event.sourceVersion,
        event.generation,
      );
      if (nextPending === base.pending) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...base,
          pending: nextPending,
        },
        effects: [],
      };
    }

    case 'ITEM_CONSUMED': {
      // Immediate local tombstone — no queue/lifecycle change.
      if (!event.itemId) {
        return { state: base, effects: [] };
      }
      const next = addConsumed(base, event.itemId);
      // Keep pending list consistent with selector (optional strip).
      const pendingIds = reconcilePending(
        next.pending.itemIds,
        next.consumed.itemIds,
      );
      return {
        state: {
          ...next,
          pending: {
            ...next.pending,
            itemIds: pendingIds,
          },
        },
        effects: [{ type: 'MARK_CONSUMED', itemId: event.itemId }],
      };
    }


    case 'DEEPLINK_ENTRY_REQUESTED': {
      const targetId = String(event.targetId).trim();
      if (!targetId) {
        return { state: base, effects: [] };
      }

      // Already consumed → idle (no card).
      if (isTargetConsumed(base, targetId, event.targetKind)) {
        return {
          state: {
            ...clearAction(base),
            items: { queue: [] },
            lifecycle: {
              status: 'idle',
              source: event.source,
              transitionId: null,
            },
            directEntry: {
              ...createEmptyDirectEntryState(),
              deferred: base.directEntry.deferred,
            },
          },
          effects: [],
        };
      }

      const deferredPayload = buildDeferred(
        event.transitionId,
        targetId,
        event.targetKind,
        event.entrySource,
        event.returnPolicy,
      );

      // Showing direct session: do not interrupt — park as deferred (newer wins).
      if (
        base.directEntry.active &&
        (base.lifecycle.status === 'submitting' ||
          base.lifecycle.status === 'recovering')
      ) {
        return {
          state: {
            ...base,
            directEntry: {
              ...base.directEntry,
              deferred: deferredPayload,
            },
          },
          effects: [],
        };
      }

      // V5 draining / host defer / recovering mid-fetch of another → park.
      const mustDefer =
        event.defer === true ||
        (base.lifecycle.status === 'recovering' &&
          base.directEntry.transitionId != null &&
          base.directEntry.transitionId !== event.transitionId);

      if (mustDefer) {
        return {
          state: {
            ...base,
            directEntry: {
              ...base.directEntry,
              deferred: deferredPayload,
            },
          },
          effects: [],
        };
      }

      // Start direct fetch (recovering = no overlay flash).
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'recovering',
            source: event.source,
            transitionId: event.transitionId,
          },
          directEntry: {
            active: true,
            transitionId: event.transitionId,
            targetId,
            targetKind: event.targetKind ?? null,
            entrySource: event.entrySource,
            returnPolicy: event.returnPolicy,
            deferred: null,
          },
        },
        effects: [
          {
            type: 'FETCH_DIRECT_ITEM',
            transitionId: event.transitionId,
            targetId,
            targetKind: event.targetKind ?? null,
            entrySource: event.entrySource,
            source: event.source,
          },
        ],
      };
    }

    case 'DIRECT_ITEM_RECEIVED': {
      if (
        base.directEntry.transitionId !== event.transitionId &&
        base.lifecycle.transitionId !== event.transitionId
      ) {
        // Stale — ignore (do not touch newer transition / lobby).
        return { state: base, effects: [] };
      }
      if (
        base.lifecycle.status !== 'recovering' &&
        !(
          base.directEntry.active &&
          base.directEntry.transitionId === event.transitionId
        )
      ) {
        // Allow receive when already recovering for this transition.
        if (base.lifecycle.transitionId !== event.transitionId) {
          return { state: base, effects: [] };
        }
      }

      const itemId = notificationItemId(event.item);
      if (base.consumed.itemIds.includes(itemId)) {
        return {
          state: {
            ...clearAction(base),
            items: { queue: [] },
            lifecycle: {
              status: 'idle',
              source: event.source,
              transitionId: null,
            },
            directEntry: {
              ...createEmptyDirectEntryState(),
              deferred: base.directEntry.deferred,
            },
          },
          effects: [],
        };
      }

      // Head = direct item; prior queue (minus duplicate) retained. Never activate.
      const rest = base.items.queue.filter(
        (q) => notificationItemId(q) !== itemId,
      );
      const queue = [event.item, ...rest];
      const next: NotificationRuntimeState = {
        ...clearAction(base),
        items: { queue },
        lifecycle: {
          status: 'idle',
          source: event.source,
          transitionId: null,
        },
        directEntry: {
          active: false,
          transitionId: null,
          targetId: null,
          targetKind: null,
          entrySource: null,
          returnPolicy: null,
          deferred: base.directEntry.deferred,
        },
      };
      return { state: next, effects: [] };
    }

    case 'DIRECT_ITEM_FAILED': {
      if (
        base.directEntry.transitionId !== event.transitionId &&
        base.lifecycle.transitionId !== event.transitionId
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...clearAction(base),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
          directEntry: {
            ...createEmptyDirectEntryState(),
            deferred: base.directEntry.deferred,
          },
        },
        effects: [],
      };
    }

    case 'DIRECT_ENTRY_FLUSH_REQUESTED': {
      const deferred = base.directEntry.deferred;
      if (!deferred) {
        return { state: base, effects: [] };
      }
      // Only flush when idle and no active direct fetch.
      if (base.lifecycle.status !== 'idle' || base.directEntry.active) {
        return { state: base, effects: [] };
      }
      if (isTargetConsumed(base, deferred.targetId, deferred.targetKind)) {
        return {
          state: {
            ...base,
            directEntry: createEmptyDirectEntryState(),
          },
          effects: [],
        };
      }
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'recovering',
            source: event.source,
            transitionId: deferred.transitionId,
          },
          directEntry: {
            active: true,
            transitionId: deferred.transitionId,
            targetId: deferred.targetId,
            targetKind: deferred.targetKind,
            entrySource: deferred.entrySource,
            returnPolicy: deferred.returnPolicy,
            deferred: null,
          },
        },
        effects: [
          {
            type: 'FETCH_DIRECT_ITEM',
            transitionId: deferred.transitionId,
            targetId: deferred.targetId,
            targetKind: deferred.targetKind,
            entrySource: deferred.entrySource,
            source: event.source,
          },
        ],
      };
    }

    case 'ACTIVATE_READY_ITEM_REQUESTED': {
      // Explicit domain claim only. Ingest must never emit this.
      if (base.activation.type === 'ACTIVE') {
        const stillQueued = base.items.queue.some(
          (item) => notificationItemId(item) === base.activation.itemId,
        );
        if (stillQueued) {
          // Deterministic no-op: keep the same active item; do not advance queue.
          return { state: base, effects: [] };
        }
        // Stale claim — drop it and fall through to claim ready head.
        base = {
          ...base,
          activation: { type: 'INACTIVE' },
        };
      }
      const headId = selectCurrentItemId(base);
      if (!headId) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...base,
          activation: { type: 'ACTIVE', itemId: headId },
        },
        effects: [],
      };
    }

    case 'CLEAR_ACTIVATION_REQUESTED': {
      if (base.activation.type === 'INACTIVE') {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...base,
          activation: { type: 'INACTIVE' },
        },
        effects: [],
      };
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state: base, effects: [] };
    }
  }
}



/**
 * Test/offline invariant helper — queue/action/activation only (no display).
 */
export function assertNotificationRuntimeInvariant(
  state: NotificationRuntimeState,
): void {
  const errors: string[] = [];

  if (state.lifecycle.status === 'submitting') {
    if (state.items.queue.length === 0) {
      errors.push('submitting requires non-empty queue');
    }
  }

  if (state.action.status === 'pending') {
    if (!state.action.commandId || !state.action.targetItemId) {
      errors.push('pending action requires commandId and targetItemId');
    }
  }

  if (
    state.action.status === 'pending' &&
    state.lifecycle.status !== 'submitting'
  ) {
    errors.push('pending action requires submitting lifecycle');
  }

  const seen = new Set<string>();
  for (const item of state.items.queue) {
    const id = notificationItemId(item);
    if (seen.has(id)) errors.push(`duplicate queue id ${id}`);
    seen.add(id);
  }

  if (state.activation.type === 'ACTIVE') {
    if (!seen.has(state.activation.itemId)) {
      errors.push(
        `active item ${state.activation.itemId} must remain in queue`,
      );
    }
  }

  if (errors.length) {
    throw new Error(`NotificationRuntime invariant: ${errors.join('; ')}`);
  }
}
