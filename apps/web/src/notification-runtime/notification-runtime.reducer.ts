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

function cloneState(state: NotificationRuntimeState): NotificationRuntimeState {
  return {
    lifecycle: { ...state.lifecycle },
    items: { queue: [...state.items.queue] },
    display: { ...state.display },
    action: { ...state.action },
    pending: {
      itemIds: [...state.pending.itemIds],
      sourceVersion: state.pending.sourceVersion,
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
  if (state.consumed.itemIds.includes(itemId)) return state;
  return {
    ...state,
    consumed: {
      itemIds: [...state.consumed.itemIds, itemId],
    },
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
        itemIds: pendingIds,
        sourceVersion: next.pending.sourceVersion,
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
      return {
        state: {
          ...base,
          lifecycle: {
            status: 'booting',
            source: event.source,
            transitionId: event.transitionId,
          },
          recovery: {
            status: 'loading',
            snapshotVersion: null,
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
      // Same drain entry as DRAIN_REQUESTED; SUCCESS host already closed product UI.
      if (
        base.lifecycle.status === 'showing' ||
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

    case 'BOOTSTRAP_COMPLETED': {
      const queue = dedupeAppend([], event.items);
      const pendingIds = reconcilePending(
        event.pendingItemIds,
        base.consumed.itemIds,
      );
      let next: NotificationRuntimeState = {
        ...base,
        items: { queue },
        pending: {
          itemIds: pendingIds,
          sourceVersion: event.sourceVersion,
        },
        recovery: {
          status: 'applied',
          snapshotVersion: event.sourceVersion,
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
      return { state: next, effects };
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
          pending: {
            itemIds: pendingIds,
            sourceVersion: event.sourceVersion,
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
        pending: {
          itemIds: pendingIds,
          sourceVersion: event.sourceVersion,
        },
        consumed: { itemIds: consumed },
        recovery: {
          status: 'applied',
          snapshotVersion: event.snapshotVersion,
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

  if (errors.length > 0) {
    throw new Error(
      `NotificationRuntimeInvariant:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}
