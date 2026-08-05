/**
 * Stage 8 Phase 8 — single Notifications Runtime reducer.
 * Item mutations only through Phase 7 reconcile kernel.
 */
import {
  applyCausalNextClaimV1,
  beginActionCaptureV1,
  claimActiveItemV1,
  reconcileNotificationsDeltaV1,
  reconcileNotificationsSnapshotV1,
  rebuildPassiveFifoV1,
} from './notification-runtime.reconcile';
import { selectNotificationsMayActivateV1 } from './notification-runtime.open-gate';
import { compareNotificationSequenceV1 } from './notification-runtime.sequence';
import type {
  NotificationItem,
  NotificationRuntimeEvent,
  NotificationRuntimeReducerResult,
  NotificationRuntimeState,
  RuntimeEffect,
} from './notification-runtime.types';
import { createInitialNotificationRuntimeState } from './notification-runtime.types';

function mergePresentation(
  current: Readonly<Record<string, NotificationItem>>,
  patch: Readonly<Record<string, NotificationItem>> | undefined,
  keepIds: ReadonlySet<string>,
): Record<string, NotificationItem> {
  const next: Record<string, NotificationItem> = {};
  for (const id of keepIds) {
    if (patch?.[id]) next[id] = patch[id]!;
    else if (current[id]) next[id] = current[id]!;
  }
  if (patch) {
    for (const [id, item] of Object.entries(patch)) {
      if (keepIds.has(id)) next[id] = item;
    }
  }
  return next;
}

function withReconcileBase(
  state: NotificationRuntimeState,
  next: Omit<
    NotificationRuntimeState,
    'presentationByItemId' | 'lastConflict' | 'syncTransitionId'
  > &
    Partial<
      Pick<
        NotificationRuntimeState,
        'presentationByItemId' | 'lastConflict' | 'syncTransitionId'
      >
    >,
): NotificationRuntimeState {
  return {
    ...state,
    ...next,
    presentationByItemId:
      next.presentationByItemId ?? state.presentationByItemId,
    lastConflict:
      next.lastConflict !== undefined ? next.lastConflict : state.lastConflict,
    syncTransitionId:
      next.syncTransitionId !== undefined
        ? next.syncTransitionId
        : state.syncTransitionId,
  };
}

export function notificationRuntimeReducer(
  state: NotificationRuntimeState,
  event: NotificationRuntimeEvent,
): NotificationRuntimeReducerResult {
  switch (event.type) {
    case 'RESET_REQUESTED': {
      return {
        state: createInitialNotificationRuntimeState(),
        effects: [],
      };
    }

    case 'SYNC_STARTED': {
      // Preserve reconcile conflicts across background SYNCING so open/activate
      // stay blocked until a successful apply clears lastConflict.
      const conflict = state.lastConflict;
      const preserveConflict =
        conflict != null &&
        (conflict.type === 'REVISION_GAP' ||
          conflict.type === 'ACTIVE_ITEM_CONFLICT' ||
          conflict.type === 'ACTIVE_ITEM_REMOVE_CONFLICT' ||
          conflict.type === 'INVALID_CONTRACT');
      return {
        state: {
          ...state,
          syncStatus: 'SYNCING',
          syncTransitionId: event.transitionId,
          lastConflict: preserveConflict ? conflict : null,
        },
        effects: [],
      };
    }

    case 'SYNC_RECOVERY_STARTED': {
      // Conflict recovery / reconnect recovery — keep conflict marker if present.
      const conflict = state.lastConflict;
      const preserveConflict =
        conflict != null &&
        (conflict.type === 'REVISION_GAP' ||
          conflict.type === 'ACTIVE_ITEM_CONFLICT' ||
          conflict.type === 'ACTIVE_ITEM_REMOVE_CONFLICT' ||
          conflict.type === 'INVALID_CONTRACT');
      return {
        state: {
          ...state,
          syncStatus: 'RECOVERING',
          syncTransitionId: event.transitionId,
          lastConflict: preserveConflict ? conflict : null,
        },
        effects: [],
      };
    }

    case 'SYNC_FAILED': {
      if (
        state.syncTransitionId &&
        event.transitionId !== state.syncTransitionId
      ) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          syncStatus: 'FAILED',
          lastConflict: {
            type: 'INVALID_CONTRACT',
            detail: event.errorCode,
          },
        },
        effects: [],
      };
    }

    case 'APPLY_NOTIFICATIONS_SNAPSHOT_V1': {
      if (
        state.syncTransitionId &&
        event.transitionId !== state.syncTransitionId &&
        (state.syncStatus === 'SYNCING' || state.syncStatus === 'RECOVERING')
      ) {
        // Stale sync response — ignore
        return { state, effects: [] };
      }
      const result = reconcileNotificationsSnapshotV1(state, event.snapshot);
      const effects: RuntimeEffect[] = [];
      if (result.type === 'STALE_IGNORED') {
        return { state, effects: [] };
      }
      if (result.type === 'INVALID_CONTRACT') {
        return {
          state: {
            ...state,
            lastConflict: {
              type: 'INVALID_CONTRACT',
              detail: result.reason,
            },
          },
          effects: [{ type: 'REQUEST_FULL_SYNC', reason: result.reason }],
        };
      }
      if (result.type === 'ACTIVE_ITEM_CONFLICT') {
        const keep = new Set(Object.keys(result.state.itemsById));
        return {
          state: withReconcileBase(state, {
            ...result.state,
            presentationByItemId: mergePresentation(
              state.presentationByItemId,
              event.presentationByItemId,
              keep,
            ),
            lastConflict: {
              type: 'ACTIVE_ITEM_CONFLICT',
              detail: result.reason,
            },
            syncTransitionId: null,
          }),
          effects: [
            {
              type: 'REQUEST_FULL_SYNC',
              reason: 'ACTIVE_ITEM_MISSING_FROM_SNAPSHOT',
            },
          ],
        };
      }
      // APPLIED
      const keep = new Set(Object.keys(result.state.itemsById));
      return {
        state: withReconcileBase(state, {
          ...result.state,
          presentationByItemId: mergePresentation(
            state.presentationByItemId,
            event.presentationByItemId,
            keep,
          ),
          lastConflict: null,
          syncTransitionId: null,
        }),
        effects,
      };
    }

    case 'APPLY_NOTIFICATIONS_DELTA_V1': {
      const result = reconcileNotificationsDeltaV1(state, event.delta, {
        activeRemoveAuthorization: event.activeRemoveAuthorization,
      });
      if (result.type === 'REVISION_GAP') {
        return {
          state: {
            ...state,
            lastConflict: {
              type: 'REVISION_GAP',
              detail: `expected ${result.expected} received ${result.received}`,
            },
          },
          effects: [{ type: 'REQUEST_FULL_SYNC', reason: 'REVISION_GAP' }],
        };
      }
      if (result.type === 'ACTIVE_ITEM_REMOVE_CONFLICT') {
        return {
          state: {
            ...state,
            lastConflict: {
              type: 'ACTIVE_ITEM_REMOVE_CONFLICT',
              detail: result.itemId,
            },
          },
          effects: [
            {
              type: 'REQUEST_FULL_SYNC',
              reason: 'ACTIVE_ITEM_REMOVE_CONFLICT',
            },
          ],
        };
      }
      if (result.type === 'INVALID_CONTRACT') {
        return {
          state: {
            ...state,
            lastConflict: {
              type: 'INVALID_CONTRACT',
              detail: result.reason,
            },
          },
          effects: [{ type: 'REQUEST_FULL_SYNC', reason: result.reason }],
        };
      }
      let next = result.state;
      const effects: RuntimeEffect[] = [];
      const removedActiveId = event.activeRemoveAuthorization?.itemId ?? null;

      // After authorized active REMOVE: claim NEXT_IN_SESSION caused by it, then promote.
      if (
        event.promoteCausalNext &&
        next.activeItemId == null &&
        removedActiveId
      ) {
        if (next.causalNextItemId == null) {
          for (const item of Object.values(next.itemsById)) {
            if (
              item.deliveryPolicy === 'NEXT_IN_SESSION' &&
              item.causedByItemId === removedActiveId
            ) {
              const claimed = applyCausalNextClaimV1(next, {
                completedItemId: removedActiveId,
                confirmedCausalItemId: item.itemId,
              });
              if (claimed.type === 'APPLIED') {
                next = claimed.state;
              }
              break;
            }
          }
        }
        if (
          next.causalNextItemId != null &&
          next.itemsById[next.causalNextItemId]
        ) {
          const causalId = next.causalNextItemId;
          next = {
            ...next,
            activeItemId: causalId,
            causalNextItemId: null,
            action: {
              status: 'IDLE',
              itemId: null,
              actionId: null,
              errorCode: null,
            },
            passiveItemIds: rebuildPassiveFifoV1(next.itemsById, causalId, null),
          };
        } else {
          next = {
            ...next,
            action: {
              status: 'IDLE',
              itemId: null,
              actionId: null,
              errorCode: null,
            },
          };
          effects.push({ type: 'SESSION_COMPLETE', reason: 'action' });
        }
      }

      const keep = new Set(Object.keys(next.itemsById));
      return {
        state: withReconcileBase(state, {
          ...next,
          presentationByItemId: mergePresentation(
            state.presentationByItemId,
            event.presentationByItemId,
            keep,
          ),
          lastConflict: null,
        }),
        effects,
      };
    }

    case 'ACTIVATE_READY_ITEM_REQUESTED': {
      const gate = selectNotificationsMayActivateV1(state);
      if (!gate.available) {
        return {
          state,
          effects: [],
          activationOutcome: { type: 'SYNC_NOT_READY' },
        };
      }
      if (state.activeItemId != null && state.itemsById[state.activeItemId]) {
        return {
          state,
          effects: [],
          activationOutcome: {
            type: 'ALREADY_ACTIVE',
            itemId: state.activeItemId,
          },
        };
      }
      // Stale claim without item — clear then activate
      let base = state;
      if (state.activeItemId != null && !state.itemsById[state.activeItemId]) {
        base = {
          ...state,
          activeItemId: null,
          passiveItemIds: rebuildPassiveFifoV1(
            state.itemsById,
            null,
            state.causalNextItemId,
          ),
        };
      }
      const head = base.passiveItemIds[0];
      if (!head) {
        return {
          state: base,
          effects: [{ type: 'SESSION_COMPLETE', reason: 'no_ready' }],
          activationOutcome: { type: 'NO_READY_ITEM' },
        };
      }
      const claimed = claimActiveItemV1(base, head);
      if (claimed.type !== 'APPLIED') {
        return {
          state: base,
          effects: [],
          activationOutcome: { type: 'NO_READY_ITEM' },
        };
      }
      return {
        state: withReconcileBase(state, claimed.state),
        effects: [],
        activationOutcome: { type: 'ACTIVATED', itemId: head },
      };
    }

    case 'ACTIVE_ITEM_CLOSE_REQUESTED': {
      // User CLOSE: return active to passive at server sequence; do not REMOVE.
      // Always emit SESSION_COMPLETE — sole owner-release producer for Close
      // (Surface must not also dispatch NOTIFICATIONS_RELEASE_REQUESTED).
      if (state.activeItemId == null) {
        return {
          state,
          effects: [{ type: 'SESSION_COMPLETE', reason: 'close' }],
        };
      }
      const next = {
        ...state,
        activeItemId: null,
        action: {
          status: 'IDLE' as const,
          itemId: null,
          actionId: null,
          errorCode: null,
        },
        passiveItemIds: rebuildPassiveFifoV1(
          state.itemsById,
          null,
          state.causalNextItemId,
        ),
      };
      return {
        state: next,
        effects: [{ type: 'SESSION_COMPLETE', reason: 'close' }],
      };
    }

    case 'CLEAR_ACTIVATION_REQUESTED': {
      if (state.activeItemId == null) return { state, effects: [] };
      return {
        state: {
          ...state,
          activeItemId: null,
          passiveItemIds: rebuildPassiveFifoV1(
            state.itemsById,
            null,
            state.causalNextItemId,
          ),
        },
        effects: [],
      };
    }

    case 'CARD_ACTION_REQUESTED': {
      if (state.action.status === 'SUBMITTING') {
        return { state, effects: [] };
      }
      if (state.activeItemId == null) {
        return { state, effects: [] };
      }
      if (event.targetItemId !== state.activeItemId) {
        return {
          state: {
            ...state,
            lastConflict: {
              type: 'INVALID_CONTRACT',
              detail: 'action-target-not-active',
            },
          },
          effects: [],
        };
      }
      const captured = beginActionCaptureV1(state, event.commandId);
      if (captured.type !== 'APPLIED') {
        return { state, effects: [] };
      }
      // Map SUBMITTING onto reconcile action; keep legacy mapping for capability
      return {
        state: withReconcileBase(state, captured.state),
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

    case 'CARD_ACTION_FAILED': {
      if (
        state.action.actionId !== event.commandId ||
        state.action.itemId !== event.targetItemId
      ) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          action: {
            status: 'FAILED',
            itemId: event.targetItemId,
            actionId: event.commandId,
            errorCode: event.errorCode,
          },
        },
        effects: [],
      };
    }

    case 'CARD_ACTION_SUCCEEDED': {
      if (
        state.action.actionId !== event.commandId ||
        state.action.itemId !== event.targetItemId
      ) {
        return { state, effects: [] };
      }
      if (!event.delta) {
        // Success without ops — clear submitting, keep active (e.g. waiting check)
        return {
          state: {
            ...state,
            action: {
              status: 'IDLE',
              itemId: null,
              actionId: null,
              errorCode: null,
            },
          },
          effects: [],
        };
      }
      // Apply confirmed delta with active REMOVE authorization
      return notificationRuntimeReducer(
        {
          ...state,
          action: {
            status: 'SUBMITTING',
            itemId: event.targetItemId,
            actionId: event.commandId,
            errorCode: null,
          },
        },
        {
          type: 'APPLY_NOTIFICATIONS_DELTA_V1',
          transitionId: event.commandId,
          delta: event.delta,
          presentationByItemId: event.presentationByItemId,
          activeRemoveAuthorization: {
            actionId: event.commandId,
            itemId: event.targetItemId,
          },
          promoteCausalNext: event.promoteCausalNext ?? true,
          source: event.source,
        },
      );
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state, effects: [] };
    }
  }
}

export function assertNotificationRuntimeInvariant(
  state: NotificationRuntimeState,
): void {
  if (
    state.activeItemId != null &&
    state.passiveItemIds.includes(state.activeItemId)
  ) {
    throw new Error('invariant: active in passive');
  }
  if (
    state.action.status === 'SUBMITTING' &&
    state.action.itemId != null &&
    state.action.itemId !== state.activeItemId
  ) {
    throw new Error('invariant: submitting retarget');
  }
  const sorted = [...state.passiveItemIds].sort((a, b) => {
    const ia = state.itemsById[a];
    const ib = state.itemsById[b];
    if (!ia || !ib) return 0;
    return compareNotificationSequenceV1(ia.sequence, ib.sequence);
  });
  for (let i = 0; i < state.passiveItemIds.length; i++) {
    if (state.passiveItemIds[i] !== sorted[i]) {
      throw new Error('invariant: passive not sequence ASC');
    }
  }
}
