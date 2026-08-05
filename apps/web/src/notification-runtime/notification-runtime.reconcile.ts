/**
 * Notifications Runtime — pure Sync V1 reconcile kernel.
 *
 * Isolated foundation: no React, HTTP, WS, Mapper, Coordinator, Presenter, UI.
 * Not yet wired to the production Runtime store or transport.
 */
import type {
  NotificationItemV1,
  NotificationsDeltaV1,
  NotificationsSnapshotV1,
} from '@98plus/shared';
import { assertDeliveryPolicyV1, notificationItemIdV1 } from '@98plus/shared';
import {
  compareNotificationSequenceV1,
  isRevisionEqualV1,
  sortItemIdsBySequenceV1,
} from './notification-runtime.sequence';
import type {
  ActionTargetV1,
  ActiveRemoveAuthorizationV1,
  NotificationsAvailabilityV1,
  NotificationsReconcileResultV1,
  NotificationsReconcileStateV1,
} from './notification-runtime.sync-types';
import { selectNotificationsMayActivateV1 } from './notification-runtime.open-gate';

function cloneState(
  state: NotificationsReconcileStateV1,
): NotificationsReconcileStateV1 {
  return {
    syncStatus: state.syncStatus,
    revision: state.revision,
    itemsById: { ...state.itemsById },
    passiveItemIds: [...state.passiveItemIds],
    activeItemId: state.activeItemId,
    causalNextItemId: state.causalNextItemId,
    action: { ...state.action },
  };
}

function validateItemContract(item: NotificationItemV1): string | null {
  try {
    assertDeliveryPolicyV1({
      deliveryPolicy: item.deliveryPolicy,
      causedByItemId: item.causedByItemId,
    });
  } catch (e) {
    return (e as Error).message;
  }
  const expected = notificationItemIdV1(item.kind, item.banId);
  if (item.itemId !== expected) {
    return `itemId mismatch: expected ${expected}, got ${item.itemId}`;
  }
  if (item.payload.kind !== item.kind) {
    return `payload.kind mismatch for ${item.itemId}`;
  }
  if (!/^-?\d+$/.test(item.sequence)) {
    return `invalid sequence for ${item.itemId}`;
  }
  return null;
}

function validateSnapshot(snapshot: NotificationsSnapshotV1): string | null {
  if (snapshot.type !== 'SNAPSHOT') return 'not a SNAPSHOT';
  if (!/^-?\d+$/.test(snapshot.revision)) return 'invalid snapshot revision';
  const seen = new Set<string>();
  for (const item of snapshot.items) {
    if (seen.has(item.itemId)) return `duplicate itemId ${item.itemId}`;
    seen.add(item.itemId);
    const err = validateItemContract(item);
    if (err) return err;
  }
  return null;
}

function validateDelta(delta: NotificationsDeltaV1): string | null {
  if (delta.type !== 'DELTA') return 'not a DELTA';
  if (!/^-?\d+$/.test(delta.fromRevision)) return 'invalid fromRevision';
  if (!/^-?\d+$/.test(delta.revision)) return 'invalid delta revision';
  let prev: string | null = null;
  for (const op of delta.operations) {
    if (!/^-?\d+$/.test(op.revision)) return `invalid op revision`;
    if (prev != null && compareNotificationSequenceV1(op.revision, prev) < 0) {
      return 'operations not ordered by revision ASC';
    }
    prev = op.revision;
    if (op.type === 'UPSERT_ITEM') {
      const err = validateItemContract(op.item);
      if (err) return err;
    } else if (op.type === 'REMOVE_ITEM') {
      if (!op.itemId.trim()) return 'REMOVE_ITEM missing itemId';
    }
  }
  return null;
}

/**
 * Rebuild passive FIFO from itemsById, excluding active and causalNext.
 * Only FIFO deliveryPolicy items enter the passive list.
 */
export function rebuildPassiveFifoV1(
  itemsById: Readonly<Record<string, NotificationItemV1>>,
  activeItemId: string | null,
  causalNextItemId: string | null,
): string[] {
  const ids = Object.keys(itemsById).filter((id) => {
    if (id === activeItemId) return false;
    if (id === causalNextItemId) return false;
    const item = itemsById[id];
    if (!item) return false;
    return item.deliveryPolicy === 'FIFO';
  });
  return sortItemIdsBySequenceV1(ids, itemsById);
}

/**
 * Enforce structural invariants after a mutation. Returns reason or null.
 */
export function assertReconcileInvariantsV1(
  state: NotificationsReconcileStateV1,
): string | null {
  const { itemsById, passiveItemIds, activeItemId, causalNextItemId } = state;

  if (activeItemId != null && !itemsById[activeItemId]) {
    return 'activeItemId missing from itemsById';
  }
  if (causalNextItemId != null) {
    const causal = itemsById[causalNextItemId];
    if (!causal) return 'causalNextItemId missing from itemsById';
    if (causal.deliveryPolicy !== 'NEXT_IN_SESSION') {
      return 'causalNextItemId is not NEXT_IN_SESSION';
    }
  }
  if (activeItemId != null && passiveItemIds.includes(activeItemId)) {
    return 'activeItemId present in passiveItemIds';
  }
  if (causalNextItemId != null && passiveItemIds.includes(causalNextItemId)) {
    return 'causalNextItemId present in passiveItemIds';
  }
  const seen = new Set<string>();
  for (const id of passiveItemIds) {
    if (seen.has(id)) return 'duplicate in passiveItemIds';
    seen.add(id);
    if (!itemsById[id]) return `passive id missing from itemsById: ${id}`;
  }
  const sorted = sortItemIdsBySequenceV1(passiveItemIds, itemsById);
  for (let i = 0; i < passiveItemIds.length; i++) {
    if (passiveItemIds[i] !== sorted[i]) {
      return 'passiveItemIds not sequence ASC';
    }
  }
  if (
    state.action.status === 'SUBMITTING' &&
    state.action.itemId != null &&
    state.action.itemId !== state.activeItemId
  ) {
    return 'SUBMITTING action.itemId must equal activeItemId';
  }
  return null;
}

/**
 * Pure causal-next selection. Does not activate; does not infer from banId.
 */
export function selectCausalNextItemIdV1(input: {
  itemsById: Readonly<Record<string, NotificationItemV1>>;
  completedItemId: string;
  /** Item id of the confirmed NEXT_IN_SESSION result from the same action. */
  confirmedCausalItemId: string;
  existingCausalNextItemId: string | null;
}): string | null {
  const {
    itemsById,
    completedItemId,
    confirmedCausalItemId,
    existingCausalNextItemId,
  } = input;

  if (
    existingCausalNextItemId != null &&
    existingCausalNextItemId !== confirmedCausalItemId
  ) {
    return null;
  }

  const candidate = itemsById[confirmedCausalItemId];
  if (!candidate) return null;
  if (candidate.deliveryPolicy !== 'NEXT_IN_SESSION') return null;
  if (candidate.causedByItemId !== completedItemId) return null;
  return confirmedCausalItemId;
}

/** Future action target: active item only — never passive head. */
export function selectActionTargetV1(
  state: NotificationsReconcileStateV1,
): ActionTargetV1 {
  if (state.activeItemId == null) {
    return { ok: false, reason: 'NO_ACTIVE_ITEM' };
  }
  const item = state.itemsById[state.activeItemId];
  if (!item) {
    return { ok: false, reason: 'ACTIVE_ITEM_MISSING' };
  }
  return { ok: true, itemId: state.activeItemId, item };
}

/**
 * Capture stable action target when an action begins (pure helper).
 */
export function beginActionCaptureV1(
  state: NotificationsReconcileStateV1,
  actionId: string,
): NotificationsReconcileResultV1 {
  const target = selectActionTargetV1(state);
  if (!target.ok) {
    return {
      type: 'INVALID_CONTRACT',
      state,
      reason: target.reason,
    };
  }
  const next = cloneState(state);
  next.action = {
    status: 'SUBMITTING',
    itemId: target.itemId,
    actionId,
    errorCode: null,
  };
  return { type: 'APPLIED', state: next };
}

export function selectNotificationsAvailabilityV1(
  state: NotificationsReconcileStateV1 & {
    lastConflict?: Parameters<
      typeof selectNotificationsMayActivateV1
    >[0]['lastConflict'];
  },
): NotificationsAvailabilityV1 {
  return selectNotificationsMayActivateV1(state);
}

function dedupeSnapshotItems(
  items: readonly NotificationItemV1[],
): NotificationItemV1[] {
  const byId = new Map<string, NotificationItemV1>();
  for (const item of items) {
    byId.set(item.itemId, item);
  }
  return [...byId.values()];
}

/**
 * Reconcile an authoritative server snapshot into target sync state.
 * Never emits sessionCompleted / owner release / auto-activation.
 */
export function reconcileNotificationsSnapshotV1(
  state: NotificationsReconcileStateV1,
  snapshot: NotificationsSnapshotV1,
): NotificationsReconcileResultV1 {
  const invalid = validateSnapshot(snapshot);
  if (invalid) {
    return { type: 'INVALID_CONTRACT', state, reason: invalid };
  }

  // Snapshot revision older than current → reject; state unchanged.
  if (
    state.revision != null &&
    compareNotificationSequenceV1(snapshot.revision, state.revision) < 0
  ) {
    return { type: 'STALE_IGNORED', state };
  }

  const items = dedupeSnapshotItems(snapshot.items);
  const next = cloneState(state);
  next.revision = snapshot.revision;
  next.syncStatus = 'READY';

  if (next.activeItemId == null) {
    const itemsById: Record<string, NotificationItemV1> = {};
    for (const item of items) {
      itemsById[item.itemId] = item;
    }
    if (next.causalNextItemId != null && !itemsById[next.causalNextItemId]) {
      next.causalNextItemId = null;
    }
    next.itemsById = itemsById;
    next.passiveItemIds = rebuildPassiveFifoV1(
      itemsById,
      null,
      next.causalNextItemId,
    );
    return { type: 'APPLIED', state: next };
  }

  const activeId = next.activeItemId;
  const snapshotHasActive = items.some((i) => i.itemId === activeId);
  if (!snapshotHasActive) {
    // Preserve active claim; do not silently clear; typed conflict.
    const itemsById: Record<string, NotificationItemV1> = {};
    const localActive = state.itemsById[activeId];
    if (localActive) {
      itemsById[activeId] = localActive;
    }
    for (const item of items) {
      itemsById[item.itemId] = item;
    }
    next.itemsById = itemsById;
    next.activeItemId = activeId;
    if (next.causalNextItemId != null && !itemsById[next.causalNextItemId]) {
      next.causalNextItemId = null;
    }
    next.passiveItemIds = rebuildPassiveFifoV1(
      itemsById,
      activeId,
      next.causalNextItemId,
    );
    return {
      type: 'ACTIVE_ITEM_CONFLICT',
      state: next,
      itemId: activeId,
      reason: 'MISSING_FROM_SNAPSHOT',
    };
  }

  const itemsById: Record<string, NotificationItemV1> = {};
  for (const item of items) {
    itemsById[item.itemId] = item;
  }
  next.itemsById = itemsById;
  next.activeItemId = activeId;
  if (next.causalNextItemId != null && !itemsById[next.causalNextItemId]) {
    next.causalNextItemId = null;
  }
  next.passiveItemIds = rebuildPassiveFifoV1(
    itemsById,
    activeId,
    next.causalNextItemId,
  );
  return { type: 'APPLIED', state: next };
}

function applyUpsert(
  state: NotificationsReconcileStateV1,
  item: NotificationItemV1,
): void {
  state.itemsById = { ...state.itemsById, [item.itemId]: item };
  state.passiveItemIds = rebuildPassiveFifoV1(
    state.itemsById,
    state.activeItemId,
    state.causalNextItemId,
  );
}

function applyPassiveRemove(
  state: NotificationsReconcileStateV1,
  itemId: string,
): void {
  const { [itemId]: _removed, ...rest } = state.itemsById;
  void _removed;
  state.itemsById = rest;
  if (state.causalNextItemId === itemId) {
    state.causalNextItemId = null;
  }
  state.passiveItemIds = rebuildPassiveFifoV1(
    state.itemsById,
    state.activeItemId,
    state.causalNextItemId,
  );
}

/**
 * Reconcile a server delta. Atomic: gap/conflict → no partial apply.
 */
export function reconcileNotificationsDeltaV1(
  state: NotificationsReconcileStateV1,
  delta: NotificationsDeltaV1,
  options?: {
    activeRemoveAuthorization?: ActiveRemoveAuthorizationV1;
  },
): NotificationsReconcileResultV1 {
  const invalid = validateDelta(delta);
  if (invalid) {
    return { type: 'INVALID_CONTRACT', state, reason: invalid };
  }

  const currentRev = state.revision;
  if (currentRev == null) {
    return {
      type: 'REVISION_GAP',
      state,
      expected: '(null — snapshot required)',
      received: delta.fromRevision,
    };
  }

  if (!isRevisionEqualV1(delta.fromRevision, currentRev)) {
    return {
      type: 'REVISION_GAP',
      state,
      expected: currentRev,
      received: delta.fromRevision,
    };
  }

  // Idempotent: all ops already applied (delta.revision <= current)
  if (compareNotificationSequenceV1(delta.revision, currentRev) <= 0) {
    return { type: 'APPLIED', state };
  }

  const next = cloneState(state);
  const auth = options?.activeRemoveAuthorization;

  for (const op of delta.operations) {
    if (compareNotificationSequenceV1(op.revision, currentRev) <= 0) {
      continue;
    }

    if (op.type === 'UPSERT_ITEM') {
      applyUpsert(next, op.item);
      next.revision = op.revision;
      continue;
    }

    const itemId = op.itemId;
    if (next.activeItemId === itemId) {
      const authorized =
        auth != null &&
        auth.itemId === itemId &&
        next.action.status === 'SUBMITTING' &&
        next.action.itemId === itemId &&
        next.action.actionId === auth.actionId;

      if (!authorized) {
        return {
          type: 'ACTIVE_ITEM_REMOVE_CONFLICT',
          state,
          itemId,
        };
      }

      const { [itemId]: _gone, ...rest } = next.itemsById;
      void _gone;
      next.itemsById = rest;
      next.activeItemId = null;
      next.action = {
        status: 'IDLE',
        itemId: null,
        actionId: null,
        errorCode: null,
      };
      if (next.causalNextItemId === itemId) {
        next.causalNextItemId = null;
      }
      next.passiveItemIds = rebuildPassiveFifoV1(
        next.itemsById,
        null,
        next.causalNextItemId,
      );
      next.revision = op.revision;
      continue;
    }

    applyPassiveRemove(next, itemId);
    next.revision = op.revision;
  }

  next.revision = delta.revision;
  if (next.syncStatus === 'UNINITIALIZED' || next.syncStatus === 'SYNCING') {
    next.syncStatus = 'READY';
  }

  const inv = assertReconcileInvariantsV1(next);
  if (inv) {
    return { type: 'INVALID_CONTRACT', state, reason: inv };
  }

  return { type: 'APPLIED', state: next };
}

/**
 * Explicitly claim causal next after a confirmed action result (pure).
 * Does not activate the causal item.
 */
export function applyCausalNextClaimV1(
  state: NotificationsReconcileStateV1,
  input: {
    completedItemId: string;
    confirmedCausalItemId: string;
  },
): NotificationsReconcileResultV1 {
  const claimed = selectCausalNextItemIdV1({
    itemsById: state.itemsById,
    completedItemId: input.completedItemId,
    confirmedCausalItemId: input.confirmedCausalItemId,
    existingCausalNextItemId: state.causalNextItemId,
  });
  if (claimed == null) {
    return {
      type: 'INVALID_CONTRACT',
      state,
      reason: 'causal-next-rejected',
    };
  }
  const next = cloneState(state);
  next.causalNextItemId = claimed;
  next.passiveItemIds = rebuildPassiveFifoV1(
    next.itemsById,
    next.activeItemId,
    next.causalNextItemId,
  );
  return { type: 'APPLIED', state: next };
}

/** Mark sync lifecycle without touching items (pure). */
export function setNotificationsSyncStatusV1(
  state: NotificationsReconcileStateV1,
  syncStatus: NotificationsReconcileStateV1['syncStatus'],
): NotificationsReconcileStateV1 {
  return { ...state, syncStatus };
}

/** Explicitly set active claim (activation is not sync's job; test / future). */
export function claimActiveItemV1(
  state: NotificationsReconcileStateV1,
  itemId: string,
): NotificationsReconcileResultV1 {
  if (!state.itemsById[itemId]) {
    return {
      type: 'INVALID_CONTRACT',
      state,
      reason: 'claim-missing-item',
    };
  }
  if (state.activeItemId != null && state.activeItemId !== itemId) {
    return {
      type: 'INVALID_CONTRACT',
      state,
      reason: 'already-active',
    };
  }
  const next = cloneState(state);
  next.activeItemId = itemId;
  next.passiveItemIds = rebuildPassiveFifoV1(
    next.itemsById,
    itemId,
    next.causalNextItemId,
  );
  return { type: 'APPLIED', state: next };
}
