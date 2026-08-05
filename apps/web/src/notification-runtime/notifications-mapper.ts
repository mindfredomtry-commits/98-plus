/**
 * Notifications Mapper — Sync HTTP + Delta WS → Runtime APPLY commands.
 *
 * Owns Contract V1 validation and presentation hydration from Contract payloads.
 * Does not generate sequence/revision. Does not invent display identity.
 * Runtime reconcile is the only item-state writer.
 */
import {
  NOTIFICATIONS_DELTA_V1_EVENT,
  formatSenderDisplayName,
  type NotificationItemV1,
  type NotificationPartyPublicV1,
  type NotificationsDeltaV1,
  type NotificationsSnapshotV1,
  type NotificationsSyncResponseV1,
  type BanInteraction,
  type BanResult,
  type InteractionOutcome,
  type UserPublic,
} from '@98plus/shared';
import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import type {
  NotificationItem,
  NotificationRuntimeReducerResult,
} from '@/notification-runtime/notification-runtime.types';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import {
  failBootstrap,
  requestBootstrap,
} from '@/notification-runtime/notification-runtime.bootstrap';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
  redactSyncUrl,
} from '@/notification-runtime/notifications-sync-diag';

function partyToUserPublic(party: NotificationPartyPublicV1): UserPublic {
  return {
    id: party.id,
    telegramId: '0',
    username: party.username,
    firstName: party.firstName ?? '',
    lastName: null,
    avatarUrl: party.photoUrl,
    photoUrl: party.photoUrl,
    aura: 'stable',
    auraLabel: '',
    energyPercent: 50,
    streak: 0,
    isOnboarded: true,
    notificationMode: 'real-time',
  };
}

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
      sender: partyToUserPublic(payload.sender),
      receiver: partyToUserPublic(payload.receiver),
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
      durationMinutes: payload.durationMinutes as BanInteraction['durationMinutes'],
      sender: partyToUserPublic(payload.sender),
      receiver: partyToUserPublic(payload.receiver),
      isIncoming: false,
      createdAt: payload.createdAt,
      expiresAt: null,
      checkDueAt: payload.checkDueAt,
      threadId: '',
    };
    return { kind: 'check', ban };
  }
  const sender = partyToUserPublic(payload.sender);
  const receiver = partyToUserPublic(payload.receiver);
  const opponent =
    item.userId === payload.senderId ? receiver : sender;
  const result: BanResult = {
    id: payload.banId,
    text: payload.text,
    outcome: payload.outcome as InteractionOutcome,
    headline: payload.headline,
    subline: payload.subline,
    sender,
    receiver,
    viewerId: item.userId,
    opponent,
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

/** Display label used by Presenter — sourced from Contract party fields. */
export function senderLabelFromContractItem(item: NotificationItemV1): string {
  const payload = item.payload;
  const party =
    payload.kind === 'CHECK_REQUEST' && item.userId === payload.senderId
      ? payload.receiver
      : payload.sender;
  return formatSenderDisplayName(party.username, party.firstName);
}

function isSyncResponse(value: unknown): value is NotificationsSyncResponseV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: string };
  return v.type === 'SNAPSHOT' || v.type === 'DELTA';
}

export async function fetchNotificationsSyncV1(input: {
  token: string;
  afterRevision?: string | null;
  correlationId?: string;
}): Promise<NotificationsSyncResponseV1> {
  const q =
    input.afterRevision != null && input.afterRevision !== ''
      ? `?afterRevision=${encodeURIComponent(input.afterRevision)}`
      : '';
  const path = `/notifications/sync${q}`;
  const url = `${getApiUrl()}${path}`;
  const correlationId =
    input.correlationId ?? nextNotificationsSyncCorrelationId('http');
  logNotificationsSyncDiag(correlationId, 'HTTP_REQUEST_STARTED', {
    hasToken: Boolean(input.token),
    afterRevision: input.afterRevision ?? null,
  });
  logNotificationsSyncDiag(correlationId, 'HTTP_URL', {
    url: redactSyncUrl(url),
  });
  try {
    const raw = await api<unknown>(path, {
      token: input.token,
    });
    logNotificationsSyncDiag(correlationId, 'HTTP_STATUS', { status: 200 });
    logNotificationsSyncDiag(correlationId, 'HTTP_RAW_RESPONSE', {
      type:
        raw && typeof raw === 'object'
          ? (raw as { type?: string }).type ?? null
          : typeof raw,
      revision:
        raw && typeof raw === 'object'
          ? (raw as { revision?: string }).revision ?? null
          : null,
      itemCount:
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as { items?: unknown }).items)
          ? (raw as { items: unknown[] }).items.length
          : raw &&
              typeof raw === 'object' &&
              Array.isArray((raw as { operations?: unknown }).operations)
            ? (raw as { operations: unknown[] }).operations.length
            : null,
    });
    if (!isSyncResponse(raw)) {
      logNotificationsSyncDiag(correlationId, 'CONTRACT_PARSE', {
        ok: false,
        reason: 'INVALID_SYNC_RESPONSE',
      });
      throw new Error('INVALID_SYNC_RESPONSE');
    }
    logNotificationsSyncDiag(correlationId, 'CONTRACT_PARSE', {
      ok: true,
      type: raw.type,
    });
    return raw;
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logNotificationsSyncDiag(correlationId, 'HTTP_STATUS', {
      status: err.status ?? null,
      error: err.message ?? 'fetch_failed',
    });
    throw e;
  }
}

export function applySyncResponseToStore(
  store: NotificationRuntimeStore,
  input: {
    transitionId: string;
    sync: NotificationsSyncResponseV1;
    source?: 'bootstrap' | 'websocket' | 'user';
    correlationId?: string;
  },
): void {
  const source = input.source ?? 'bootstrap';
  const correlationId = input.correlationId ?? nextNotificationsSyncCorrelationId('apply');
  if (input.sync.type === 'SNAPSHOT') {
    const snapshot = input.sync as NotificationsSnapshotV1;
    logNotificationsSyncDiag(correlationId, 'MAPPER_COMMAND', {
      command: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      revision: snapshot.revision,
      itemIds: snapshot.items.map((i) => i.itemId),
    });
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
  logNotificationsSyncDiag(correlationId, 'MAPPER_COMMAND', {
    command: 'APPLY_NOTIFICATIONS_DELTA_V1',
    fromRevision: delta.fromRevision,
    revision: delta.revision,
    opCount: delta.operations.length,
  });
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
    source?: 'bootstrap' | 'websocket' | 'user';
    correlationId?: string;
  },
): NotificationRuntimeReducerResult {
  const correlationId =
    input.correlationId ?? nextNotificationsSyncCorrelationId('ws');
  logNotificationsSyncDiag(correlationId, 'WS_DELTA', {
    fromRevision: input.delta.fromRevision,
    revision: input.delta.revision,
    opCount: input.delta.operations.length,
    runtimeRevision: store.getState().revision,
    syncStatus: store.getState().syncStatus,
  });
  return store.dispatch({
    type: 'APPLY_NOTIFICATIONS_DELTA_V1',
    transitionId: input.transitionId ?? `delta-${Date.now()}`,
    delta: input.delta,
    presentationByItemId: presentationMapFromDelta(input.delta),
    activeRemoveAuthorization: input.activeRemoveAuthorization,
    promoteCausalNext: input.promoteCausalNext,
    source: input.source ?? 'websocket',
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
    correlationId?: string;
  },
): Promise<{ ok: boolean; errorCode?: string }> {
  const correlationId =
    args.correlationId ?? nextNotificationsSyncCorrelationId('boot');
  logNotificationsSyncDiag(correlationId, 'TOKEN_RESOLVED', {
    hasToken: Boolean(args.token),
    recovery: Boolean(args.recovery),
  });
  const boot = requestBootstrap(store, {
    source: 'bootstrap',
    recovery: args.recovery,
  });
  logNotificationsSyncDiag(correlationId, 'SYNC_STARTED', {
    transitionId: boot.transitionId,
    recovery: Boolean(args.recovery),
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
      correlationId,
    });
    applySyncResponseToStore(store, {
      transitionId: boot.transitionId,
      sync,
      source: 'bootstrap',
      correlationId,
    });
    const state = store.getState();
    logNotificationsSyncDiag(correlationId, 'RECONCILE_OUTCOME', {
      syncStatus: state.syncStatus,
      revision: state.revision,
      lastConflict: state.lastConflict,
    });
    logNotificationsSyncDiag(correlationId, 'RUNTIME_STATE', {
      syncStatus: state.syncStatus,
      revision: state.revision,
      itemIds: Object.keys(state.itemsById),
      passiveItemIds: [...state.passiveItemIds],
      activeItemId: state.activeItemId,
      lastConflict: state.lastConflict,
    });
    if (state.syncStatus !== 'READY') {
      const code =
        state.lastConflict?.detail ?? 'SYNC_APPLY_NOT_READY';
      logNotificationsSyncDiag(correlationId, 'SYNC_FAILED', { code });
      failBootstrap(store, {
        transitionId: boot.transitionId,
        errorCode: code,
        source: 'bootstrap',
      });
      return { ok: false, errorCode: code };
    }
    return { ok: true };
  } catch (e) {
    const code = (e as Error).message || 'SYNC_FAILED';
    logNotificationsSyncDiag(correlationId, 'SYNC_FAILED', { code });
    failBootstrap(store, {
      transitionId: boot.transitionId,
      errorCode: code,
      source: 'bootstrap',
    });
    return { ok: false, errorCode: code };
  }
}
