/**
 * Notifications Mapper — Sync HTTP + Delta WS → Runtime APPLY commands.
 *
 * Owns Contract V1 validation and presentation hydration.
 * Does not generate sequence/revision. Does not sort queues.
 * Runtime reconcile is the only item-state writer.
 */
import {
  NOTIFICATIONS_DELTA_V1_EVENT,
  type NotificationItemV1,
  type NotificationsDeltaV1,
  type NotificationsSnapshotV1,
  type NotificationsSyncResponseV1,
  type BanInteraction,
  type BanResult,
  type UserPublic,
} from '@98plus/shared';
import { api } from '@/lib/api';
import type { NotificationItem } from '@/notification-runtime/notification-runtime.types';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import {
  completeBootstrap,
  failBootstrap,
  requestBootstrap,
} from '@/notification-runtime/notification-runtime.bootstrap';

const STUB_USER = (id: string): UserPublic => ({
  id,
  telegramId: '0',
  username: null,
  firstName: null,
  lastName: null,
  avatarUrl: null,
  photoUrl: null,
  aura: 'stable',
  auraLabel: '',
  energyPercent: 50,
  streak: 0,
  isOnboarded: true,
  notificationMode: 'all',
});

export function presentationFromContractItemV1(
  item: NotificationItemV1,
): NotificationItem {
  const payload = item.payload;
  if (payload.kind === 'INCOMING_BAN') {
    const ban: BanInteraction = {
      id: payload.banId,
      text: payload.text,
      status: 'pending',
      durationMinutes: payload.durationMinutes as BanInteraction['durationMinutes'],
      sender: STUB_USER(payload.senderId),
      receiver: STUB_USER(payload.receiverId),
      isIncoming: item.userId === payload.receiverId,
      createdAt: payload.createdAt,
      expiresAt: null,
      checkDueAt: null,
      threadId: '',
    };
    return { kind: 'incoming', ban };
  }
  if (payload.kind === 'CHECK_REQUEST') {
    const ban: BanInteraction = {
      id: payload.banId,
      text: payload.text,
      status: 'checking',
      durationMinutes: 30 as BanInteraction['durationMinutes'],
      sender: STUB_USER(payload.senderId),
      receiver: STUB_USER(payload.receiverId),
      isIncoming: false,
      createdAt: payload.createdAt,
      expiresAt: null,
      checkDueAt: payload.checkDueAt,
      threadId: '',
    };
    return { kind: 'check', ban };
  }
  const result: BanResult = {
    id: payload.banId,
    text: payload.text,
    outcome: payload.outcome as BanResult['outcome'],
    headline: payload.outcome.toUpperCase(),
    subline: '',
    sender: STUB_USER(payload.senderId),
    receiver: STUB_USER(payload.receiverId),
    viewerId: item.userId,
    opponent: STUB_USER(
      item.userId === payload.senderId
        ? payload.receiverId
        : payload.senderId,
    ),
    confirmations: null,
    energy: { sender: 0, receiver: 0 },
    farmSkipped: false,
    completedAt: payload.completedAt,
    deepLink: '',
    shareLink: '',
    inviteOpponentLink: '',
  };
  return { kind: 'result', result };
}

export function presentationMapFromItems(
  items: NotificationItemV1[],
): Record<string, NotificationItem> {
  const out: Record<string, NotificationItem> = {};
  for (const item of items) {
    out[item.itemId] = presentationFromContractItemV1(item);
  }
  return out;
}

export function presentationMapFromDelta(
  delta: NotificationsDeltaV1,
): Record<string, NotificationItem> {
  const out: Record<string, NotificationItem> = {};
  for (const op of delta.operations) {
    if (op.type === 'UPSERT_ITEM') {
      out[op.item.itemId] = presentationFromContractItemV1(op.item);
    }
  }
  return out;
}

function isSyncResponse(value: unknown): value is NotificationsSyncResponseV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: string };
  return v.type === 'SNAPSHOT' || v.type === 'DELTA';
}

export async function fetchNotificationsSyncV1(input: {
  token: string;
  afterRevision?: string | null;
}): Promise<NotificationsSyncResponseV1> {
  const q =
    input.afterRevision != null && input.afterRevision !== ''
      ? `?afterRevision=${encodeURIComponent(input.afterRevision)}`
      : '';
  const raw = await api<unknown>(`/notifications/sync${q}`, {
    token: input.token,
  });
  if (!isSyncResponse(raw)) {
    throw new Error('INVALID_SYNC_RESPONSE');
  }
  return raw;
}

export function applySyncResponseToStore(
  store: NotificationRuntimeStore,
  input: {
    transitionId: string;
    sync: NotificationsSyncResponseV1;
    source?: 'bootstrap' | 'ws' | 'user';
  },
): void {
  const source = input.source ?? 'bootstrap';
  if (input.sync.type === 'SNAPSHOT') {
    const snapshot = input.sync as NotificationsSnapshotV1;
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: input.transitionId,
      snapshot,
      presentationByItemId: presentationMapFromItems(snapshot.items),
      source,
    });
    return;
  }
  const delta = input.sync as NotificationsDeltaV1;
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: input.transitionId,
    delta,
    presentationByItemId: presentationMapFromDelta(delta),
    source,
  });
}

export function applyNotificationsDeltaToStore(
  store: NotificationRuntimeStore,
  input: {
    delta: NotificationsDeltaV1;
    transitionId?: string;
    activeRemoveAuthorization?: {
      actionId: string;
      itemId: string;
    };
    promoteCausalNext?: boolean;
    source?: 'bootstrap' | 'ws' | 'user';
  },
): void {
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: input.transitionId ?? `delta-${Date.now()}`,
    delta: input.delta,
    presentationByItemId: presentationMapFromDelta(input.delta),
    activeRemoveAuthorization: input.activeRemoveAuthorization,
    promoteCausalNext: input.promoteCausalNext,
    source: input.source ?? 'ws',
  });
}

export function isNotificationsDeltaV1Event(type: string): boolean {
  return type === NOTIFICATIONS_DELTA_V1_EVENT;
}

export function parseNotificationsDeltaV1(
  payload: unknown,
): NotificationsDeltaV1 | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as NotificationsDeltaV1;
  if (p.type !== 'DELTA') return null;
  if (typeof p.fromRevision !== 'string' || typeof p.revision !== 'string') {
    return null;
  }
  if (!Array.isArray(p.operations)) return null;
  return p;
}

/**
 * Cold boot / recovery sync via Mapper.
 */
export async function runNotificationsSyncViaMapper(
  store: NotificationRuntimeStore,
  args: {
    token: string;
    recovery?: boolean;
    afterRevision?: string | null;
  },
): Promise<{ ok: boolean; errorCode?: string }> {
  const boot = requestBootstrap(store, {
    source: 'bootstrap',
    recovery: args.recovery,
  });
  try {
    const after =
      args.afterRevision !== undefined
        ? args.afterRevision
        : args.recovery
          ? store.getState().revision
          : null;
    const sync = await fetchNotificationsSyncV1({
      token: args.token,
      afterRevision: after,
    });
    applySyncResponseToStore(store, {
      transitionId: boot.transitionId,
      sync,
      source: 'bootstrap',
    });
    // APPLY sets READY via reconcile base; ensure FAILED path cleared
    if (store.getState().syncStatus !== 'READY') {
      // Snapshot/delta apply sets syncStatus via withReconcileBase — if still
      // SYNCING, mark ready explicitly only when revision applied.
      if (store.getState().revision != null) {
        store.dispatch({
          type: 'SYNC_FAILED',
          transitionId: boot.transitionId,
          errorCode: 'SYNC_STATUS_STUCK',
          source: 'bootstrap',
        });
        return { ok: false, errorCode: 'SYNC_STATUS_STUCK' };
      }
    }
    return { ok: true };
  } catch (e) {
    const code = (e as Error).message || 'SYNC_FAILED';
    failBootstrap(store, {
      transitionId: boot.transitionId,
      errorCode: code,
      source: 'bootstrap',
    });
    return { ok: false, errorCode: code };
  }
}

/** @deprecated completeBootstrap no longer applies items — prefer Mapper sync. */
export { completeBootstrap };
