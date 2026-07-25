/**
 * Vertical 0 — pure notification runtime reducer (offline contract).
 * Deterministic: no Date.now / random / API / React.
 */
import {
  createEmptyDirectEntryState,
  createInitialNotificationRuntimeState,
  displayFromItem,
  notificationItemId,
  type DeferredDirectEntry,
  type NotificationItem,
  type NotificationRuntimeEvent,
  type NotificationRuntimeReducerResult,
  type NotificationRuntimeState,
  type RuntimeEffect,
} from './notification-runtime.types';
import { selectCurrentItem, selectCurrentItemId } from './notification-runtime.selectors';
import { evaluateStaleReplaceGuard } from './notification-runtime.stale-replace-guard';

function cloneState(state: NotificationRuntimeState): NotificationRuntimeState {
  return {
    lifecycle: { ...state.lifecycle },
    items: { queue: [...state.items.queue] },
    display: { ...state.display },
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

function clearDisplay(
  state: NotificationRuntimeState,
): NotificationRuntimeState {
  return {
    ...state,
    display: {
      kind: null,
      payload: null,
      mode: 'normal',
    },
  };
}

function showHead(
  state: NotificationRuntimeState,
  source: NotificationRuntimeState['lifecycle']['source'],
  transitionId: string | null,
  mode: NotificationRuntimeState['display']['mode'] = 'normal',
): NotificationRuntimeState {
  const head = state.items.queue[0];
  if (!head) {
    return {
      ...clearDisplay(clearAction(state)),
      lifecycle: {
        status: 'idle',
        source,
        transitionId: null,
      },
    };
  }
  return {
    ...state,
    lifecycle: {
      status: 'showing',
      source,
      transitionId,
    },
    display: displayFromItem(head, mode),
    action: {
      status: 'idle',
      commandId: null,
      targetItemId: null,
      errorCode: null,
    },
  };
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
 * Pending authority rule for snapshot replacements.
 *
 * Empty is only allowed to clear when it is the current authority: a response
 * stamped older than the applied generation is dropped, and so is an empty
 * snapshot while the runtime still holds a live/queued item the server has not
 * caught up with. Non-empty snapshots always apply, so the badge is never
 * latched on.
 */
function resolvePendingReplacement(
  base: NotificationRuntimeState,
  incomingIds: string[],
  sourceVersion: string | null,
  generation: number | null | undefined,
): NotificationRuntimeState['pending'] {
  const stamped = typeof generation === 'number' ? generation : null;
  const nextGeneration = Math.max(base.pending.generation, stamped ?? 0);
  if (incomingIds.length === 0) {
    if (stamped != null && stamped < base.pending.generation) {
      return base.pending;
    }
    const holdsLocalItem =
      base.items.queue.length > 0 || base.display.kind != null;
    if (holdsLocalItem && base.pending.itemIds.length > 0) {
      return { ...base.pending, generation: nextGeneration };
    }
  }
  return {
    itemIds: incomingIds,
    sourceVersion,
    generation: nextGeneration,
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
 * Vertical 7 — repair queue/display invariants after bootstrap.
 * current = queue[0]; display only from runtime; idle ⇒ no overlay.
 */
function repairQueueDisplayInvariant(
  state: NotificationRuntimeState,
  source: NotificationRuntimeState['lifecycle']['source'],
): NotificationRuntimeState {
  const head = state.items.queue[0] ?? null;
  const overlayStatuses = new Set([
    'showing',
    'submitting',
    'completing',
  ]);

  if (state.lifecycle.status === 'idle') {
    if (state.display.kind != null || state.display.payload != null) {
      return clearDisplay(clearAction(state));
    }
    return state;
  }

  if (overlayStatuses.has(state.lifecycle.status)) {
    if (!head) {
      return {
        ...clearDisplay(clearAction(state)),
        lifecycle: {
          status: 'idle',
          source,
          transitionId: null,
        },
      };
    }
    const headId = notificationItemId(head);
    const displayId =
      state.display.payload == null
        ? null
        : state.display.payload.kind === 'result'
          ? `result:${String(state.display.payload.result.id).trim()}`
          : `${state.display.payload.kind}:${String(state.display.payload.ban.id).trim()}`;
    if (
      state.display.kind !== head.kind ||
      displayId !== headId ||
      state.display.payload == null
    ) {
      return showHead(
        state,
        source,
        state.lifecycle.transitionId,
        state.display.mode === 'direct' ||
          state.display.mode === 'direct-overboard'
          ? state.display.mode
          : 'normal',
      );
    }
  }

  return state;
}

function dismissHead(
  state: NotificationRuntimeState,
  targetItemId: string,
  transitionId: string,
  source: NotificationRuntimeState['lifecycle']['source'],
): NotificationRuntimeReducerResult {
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
    },
    targetItemId,
  );

  const effects: RuntimeEffect[] = [
    { type: 'MARK_CONSUMED', itemId: targetItemId },
  ];

  // Vertical 6: direct session → remainder to pending, clear queue, idle (no continue).
  const isDirectSession =
    state.directEntry.active ||
    state.display.mode === 'direct' ||
    state.display.mode === 'direct-overboard';
  if (isDirectSession && state.directEntry.returnPolicy === 'lobby_after_card') {
    const remainderIds = remaining.map(notificationItemId);
    const pendingIds = reconcilePending(
      [...remainderIds, ...next.pending.itemIds],
      next.consumed.itemIds,
    );
    next = {
      ...clearDisplay(clearAction(next)),
      items: { queue: [] },
      pending: {
        ...next.pending,
        itemIds: pendingIds,
      },
      lifecycle: {
        status: 'idle',
        source,
        transitionId: null,
      },
      directEntry: {
        ...createEmptyDirectEntryState(),
        // Keep deferred second request if any.
        deferred: state.directEntry.deferred,
      },
    };
    effects.push({ type: 'REFRESH_PENDING', reason: 'direct-session-complete' });
    return { state: next, effects };
  }

  if (remaining.length > 0) {
    // Atomic advance — never idle/null between cards.
    next = showHead(next, source, transitionId, 'normal');
    effects.push({ type: 'PREFETCH_NEXT', skipItemId: targetItemId });
    return { state: next, effects };
  }

  // Completion
  next = {
    ...clearDisplay(clearAction(next)),
    lifecycle: {
      status: 'idle',
      source,
      transitionId: null,
    },
  };
  effects.push({ type: 'REFRESH_PENDING', reason: 'queue-completed' });
  return { state: next, effects };
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
  const base = cloneState(state);
  const effects: RuntimeEffect[] = [];

  switch (event.type) {
    case 'RESET_REQUESTED': {
      return {
        state: createInitialNotificationRuntimeState(),
        effects: [],
      };
    }

    case 'BOOTSTRAP_REQUESTED': {
      // Vertical 7: deeplink / direct entry outranks boot snapshot display.
      const preserveDirect =
        base.directEntry.active ||
        base.display.mode === 'direct' ||
        base.display.mode === 'direct-overboard' ||
        base.directEntry.deferred != null;

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

      // Fresh boot: drop mid-flight action/display/queue; keep consumed TTL.
      return {
        state: {
          ...clearDisplay(clearAction(base)),
          items: { queue: [] },
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

    case 'DRAIN_REQUESTED': {
      if (
        base.lifecycle.status === 'showing' ||
        base.lifecycle.status === 'submitting' ||
        base.lifecycle.status === 'completing'
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'draining',
            source: event.source,
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

    case 'SUCCESS_HANDOFF_REQUESTED': {
      // Enter draining after product SUCCESS closes. Allow from idle OR showing
      // (runtime may already hold the next notification queue under the SUCCESS card).
      // Do not interrupt in-flight submit/completing actions.
      if (
        base.lifecycle.status === 'submitting' ||
        base.lifecycle.status === 'completing'
      ) {
        return { state: base, effects: [] };
      }
      if (
        base.lifecycle.status === 'draining' &&
        base.lifecycle.transitionId === event.transitionId
      ) {
        return { state: base, effects: [] };
      }
      if (
        base.lifecycle.status === 'booting' ||
        base.lifecycle.status === 'recovering'
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'draining',
            source: event.source,
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

    case 'DRAIN_FAILED': {
      if (
        base.lifecycle.status !== 'draining' ||
        base.lifecycle.transitionId !== event.transitionId
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...clearDisplay(clearAction(base)),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        },
        effects: [],
      };
    }

    case 'ITEMS_RECEIVED': {
      // Protect a currently renderable shown head from stale/empty replaceQueue.
      // Empty or different-head replaces without owning transitionId are no-ops.
      // Return the original `state` (not cloned `base`) so the store does not emit.
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

      const queue = event.replaceQueue
        ? dedupeAppend([], event.items)
        : dedupeAppend(base.items.queue, event.items);

      let next: NotificationRuntimeState = {
        ...base,
        items: { queue },
      };

      if (queue.length === 0) {
        next = {
          ...clearDisplay(clearAction(next)),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        };
        return { state: next, effects };
      }

      // Enter or stay showing with head display (atomic).
      if (
        base.lifecycle.status === 'draining' ||
        base.lifecycle.status === 'booting' ||
        base.lifecycle.status === 'idle' ||
        base.lifecycle.status === 'recovering' ||
        base.items.queue.length === 0
      ) {
        next = showHead(next, event.source, event.transitionId, 'normal');
      } else if (base.lifecycle.status === 'showing') {
        // Keep current head display if head unchanged; refresh if head replaced.
        const prevHead = selectCurrentItemId(base);
        const nextHead = queue[0] ? notificationItemId(queue[0]) : null;
        if (prevHead !== nextHead && queue[0]) {
          next = showHead(next, event.source, event.transitionId, 'normal');
        } else {
          next = {
            ...next,
            lifecycle: {
              ...next.lifecycle,
              transitionId: event.transitionId,
            },
          };
        }
      }

      return { state: next, effects };
    }

    case 'BOOTSTRAP_SNAPSHOT_RECEIVED':
    case 'BOOTSTRAP_COMPLETED': {
      const expectedTid =
        base.recovery.transitionId ?? base.lifecycle.transitionId;
      if (expectedTid && expectedTid !== event.transitionId) {
        // Stale bootstrap response — ignore.
        return { state: base, effects: [] };
      }

      const preserveDirect =
        base.directEntry.active ||
        base.display.mode === 'direct' ||
        base.display.mode === 'direct-overboard' ||
        base.directEntry.deferred != null;

      const extraConsumed = event.consumedItemIds ?? [];
      let consumedIds = [...base.consumed.itemIds];
      for (const id of extraConsumed) {
        if (id && !consumedIds.includes(id)) consumedIds.push(id);
      }

      const pendingIds = reconcilePending(event.pendingItemIds, consumedIds);
      const autoShow =
        event.type === 'BOOTSTRAP_SNAPSHOT_RECEIVED'
          ? event.autoShow
          : event.autoShow !== false;

      if (preserveDirect) {
        // Deeplink wins: refresh pending/consumed only; never replace display.
        return {
          state: {
            ...base,
            pending: resolvePendingReplacement(
              base,
              pendingIds,
              event.sourceVersion,
              null,
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
      // Normal mode: pending/badge only — empty display queue.
      const queue = autoShow ? dedupeAppend([], filteredItems) : [];

      let next: NotificationRuntimeState = {
        ...base,
        items: { queue },
        pending: resolvePendingReplacement(
          base,
          pendingIds,
          event.sourceVersion,
          null,
        ),
        consumed: { itemIds: consumedIds },
        recovery: {
          status: 'applied',
          snapshotVersion: event.sourceVersion,
          transitionId: null,
        },
      };

      if (autoShow && queue.length > 0) {
        next = showHead(next, event.source, event.transitionId, 'normal');
      } else {
        next = {
          ...clearDisplay(clearAction(next)),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        };
      }

      // Repair: display must be queue[0] when showing; idle ⇒ no overlay.
      next = repairQueueDisplayInvariant(next, event.source);
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
        base.display.mode === 'direct' ||
        base.display.mode === 'direct-overboard';

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
          ...clearDisplay(clearAction(base)),
          items: { queue: [] },
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
      if (!current || current.kind !== 'check') {
        return { state: base, effects: [] };
      }
      if (!currentId || currentId !== event.targetItemId) {
        return { state: base, effects: [] };
      }
      if (base.lifecycle.status !== 'showing') {
        return { state: base, effects: [] };
      }
      // pending = in-flight; succeeded = answered waiting for partner/result
      if (
        base.action.status === 'pending' ||
        base.action.status === 'succeeded'
      ) {
        return { state: base, effects: [] };
      }
      if (event.action !== 'check_answer') {
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
        // Atomic check→result (or any head replacement) without null gap.
        // Vertical 6: keep direct mode across check→result inside direct session.
        const mode =
          event.displayMode ??
          (base.directEntry.active || base.display.mode === 'direct'
            ? 'direct'
            : 'normal');
        next = {
          ...next,
          items: {
            queue: [event.replacement, ...next.items.queue.slice(1)],
          },
        };
        next = addConsumed(next, event.targetItemId);
        effects.push({ type: 'MARK_CONSUMED', itemId: event.targetItemId });
        next = showHead(next, event.source, next.lifecycle.transitionId, mode);
        return { state: next, effects };
      }

      next = {
        ...next,
        lifecycle: {
          status: 'showing',
          source: event.source,
          transitionId: next.lifecycle.transitionId,
        },
        action: {
          status: 'succeeded',
          commandId: event.commandId,
          targetItemId: event.targetItemId,
          errorCode: null,
        },
      };
      // Waiting / no replacement: keep check on screen; action=succeeded
      // blocks re-submit until poll/result arrives with same commandId.
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
            status: 'showing',
            source: event.source,
            transitionId: base.lifecycle.transitionId,
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

    case 'LOBBY_REQUESTED': {
      if (base.lifecycle.status !== 'idle') {
        return { state: base, effects: [] };
      }
      // Idle lobby request is a no-op on queue/display; allowed for UI.
      return {
        state: {
          ...base,
          lifecycle: {
            ...base.lifecycle,
            source: event.source,
          },
        },
        effects: [],
      };
    }

    case 'PENDING_SOURCE_UPDATED': {
      // Snapshot replace: dedupe; strip already-consumed from stored pending
      // (tombstones stay in consumed — late refresh cannot resurrect).
      const pendingIds = reconcilePending(
        event.itemIds,
        base.consumed.itemIds,
      );
      return {
        state: {
          ...base,
          pending: resolvePendingReplacement(
            base,
            pendingIds,
            event.sourceVersion,
            event.generation,
          ),
        },
        effects: [],
      };
    }

    case 'RUNTIME_NORMALIZE_IDLE': {
      // Only the transition that still owns the abandoned drain may normalize.
      if (
        base.lifecycle.status !== 'draining' ||
        base.lifecycle.transitionId !== event.transitionId
      ) {
        return { state: base, effects: [] };
      }
      return {
        state: {
          ...clearDisplay(clearAction(base)),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        },
        effects: [],
      };
    }

    case 'ITEM_CONSUMED': {
      // Immediate local tombstone — no queue/lifecycle/display change.
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

    case 'RECOVERY_REQUESTED': {
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'recovering',
            source: event.source,
            transitionId: event.transitionId,
          },
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

    case 'RECOVERY_APPLIED': {
      const queue = dedupeAppend([], event.items);
      const consumed = [...event.consumedItemIds];
      const pendingIds = reconcilePending(event.pendingItemIds, consumed);
      let next: NotificationRuntimeState = {
        ...base,
        items: { queue },
        pending: resolvePendingReplacement(
          base,
          pendingIds,
          event.sourceVersion,
          null,
        ),
        consumed: { itemIds: consumed },
        recovery: {
          status: 'applied',
          snapshotVersion: event.snapshotVersion,
          transitionId: null,
        },
      };
      if (queue.length > 0) {
        next = showHead(next, event.source, event.transitionId, 'normal');
      } else {
        next = {
          ...clearDisplay(clearAction(next)),
          lifecycle: {
            status: 'idle',
            source: event.source,
            transitionId: null,
          },
        };
      }
      next = repairQueueDisplayInvariant(next, event.source);
      return { state: next, effects };
    }

    case 'RECOVERY_FAILED': {
      return {
        state: {
          ...base,
          lifecycle: {
            status: base.items.queue.length > 0 ? 'showing' : 'idle',
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

    case 'DEEPLINK_ENTRY_REQUESTED': {
      const targetId = String(event.targetId).trim();
      if (!targetId) {
        return { state: base, effects: [] };
      }

      // Already consumed → idle + lobbyMayShow (no card).
      if (isTargetConsumed(base, targetId, event.targetKind)) {
        return {
          state: {
            ...clearDisplay(clearAction(base)),
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
        (base.lifecycle.status === 'showing' ||
          base.lifecycle.status === 'submitting' ||
          base.lifecycle.status === 'completing' ||
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
        base.lifecycle.status === 'draining' ||
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
            ...clearDisplay(clearAction(base)),
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

      // Head = direct item; keep prior queue (minus duplicate) behind for exit→pending.
      const rest = base.items.queue.filter(
        (q) => notificationItemId(q) !== itemId,
      );
      const queue = [event.item, ...rest];
      let next: NotificationRuntimeState = {
        ...base,
        items: { queue },
        directEntry: {
          active: true,
          transitionId: event.transitionId,
          targetId:
            event.item.kind === 'result'
              ? String(event.item.result.id).trim()
              : String(event.item.ban.id).trim(),
          targetKind: event.item.kind,
          entrySource: base.directEntry.entrySource ?? 'deeplink',
          returnPolicy: base.directEntry.returnPolicy ?? 'lobby_after_card',
          deferred: base.directEntry.deferred,
        },
      };
      next = showHead(next, event.source, event.transitionId, 'direct');
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
          ...clearDisplay(clearAction(base)),
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
      // Only flush when idle and no active direct session.
      if (
        base.lifecycle.status !== 'idle' ||
        base.directEntry.active ||
        selectOverlayVisibleCompat(base)
      ) {
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

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state: base, effects: [] };
    }
  }
}

/** Local helper — avoid circular import with selectors during recovering. */
function selectOverlayVisibleCompat(state: NotificationRuntimeState): boolean {
  return (
    state.lifecycle.status === 'showing' ||
    state.lifecycle.status === 'submitting' ||
    state.lifecycle.status === 'completing' ||
    state.lifecycle.status === 'draining'
  );
}

/**
 * Test/offline invariant helper — not thrown in production (contract is offline).
 * Production Validation 1.0 — expanded checks.
 */
export function assertNotificationRuntimeInvariant(
  state: NotificationRuntimeState,
): void {
  const errors: string[] = [];
  const head = state.items.queue[0] ?? null;
  const overlayStatuses = new Set([
    'showing',
    'submitting',
    'completing',
    'draining',
  ]);

  // current == queue[0] (implicit via selectors; display must match head when showing)
  if (
    state.lifecycle.status === 'showing' ||
    state.lifecycle.status === 'submitting'
  ) {
    if (state.items.queue.length === 0) {
      errors.push('showing/submitting requires non-empty queue');
    }
    if (state.display.kind == null || state.display.payload == null) {
      errors.push('showing/submitting requires display payload');
    }
    if (head && state.display.kind !== head.kind) {
      errors.push(
        `display.kind=${state.display.kind} != head.kind=${head.kind}`,
      );
    }
    if (head && state.display.payload) {
      const headId = notificationItemId(head);
      const payloadId =
        state.display.payload.kind === 'result'
          ? `result:${String(state.display.payload.result.id).trim()}`
          : `${state.display.payload.kind}:${String(state.display.payload.ban.id).trim()}`;
      if (headId !== payloadId) {
        errors.push(`display payload id ${payloadId} != head ${headId}`);
      }
    }
  }

  // idle => no overlay
  if (state.lifecycle.status === 'idle') {
    if (state.display.kind != null || state.display.payload != null) {
      errors.push('idle requires null display');
    }
    if (overlayStatuses.has(state.lifecycle.status)) {
      errors.push('idle must not be overlay status');
    }
  }

  if (state.action.status === 'pending') {
    if (!state.action.commandId || !state.action.targetItemId) {
      errors.push('pending action requires commandId and targetItemId');
    }
  }

  // pending ∩ consumed = ∅
  const consumed = new Set(state.consumed.itemIds);
  for (const id of state.pending.itemIds) {
    if (consumed.has(id)) {
      errors.push(`pending ∩ consumed non-empty: ${id}`);
    }
  }

  // Consumed items must not sit at queue head display
  if (head) {
    const headId = notificationItemId(head);
    if (consumed.has(headId) && state.lifecycle.status === 'showing') {
      errors.push(`consumed head still showing: ${headId}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `NotificationRuntimeInvariant:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}
