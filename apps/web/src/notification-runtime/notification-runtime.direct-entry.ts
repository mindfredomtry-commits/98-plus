/**
 * Stage 8 Phase 9 — deep link records target; Sync owns items.
 * Never synthesizes NotificationItem or revision.
 */
import {
  nextRuntimeTransitionId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import type {
  NotificationItem,
  NotificationItemKind,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';
import type { BanInteraction, BanResult } from '@98plus/shared';
import { notificationItemIdV1 } from '@98plus/shared';

export type DirectEntrySource = 'deeplink' | 'live-single';
export type DirectReturnPolicy = 'retain_queue';

export type DirectEntryOutcome =
  | 'queued'
  | 'idle'
  | 'deferred'
  | 'failed'
  | 'rejected'
  | 'blocked_awaiting_sync'
  | 'not_available'
  | 'activated';

export type DirectItemTransport = (args: {
  targetId: string;
  targetKind: NotificationItemKind | null;
}) => Promise<NotificationItem>;

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

function candidateItemIds(
  banId: string,
  kind: NotificationItemKind | null | undefined,
): string[] {
  if (kind === 'incoming') return [notificationItemIdV1('INCOMING_BAN', banId)];
  if (kind === 'check') return [notificationItemIdV1('CHECK_REQUEST', banId)];
  if (kind === 'result') return [notificationItemIdV1('BAN_RESULT', banId)];
  return [
    notificationItemIdV1('INCOMING_BAN', banId),
    notificationItemIdV1('CHECK_REQUEST', banId),
    notificationItemIdV1('BAN_RESULT', banId),
  ];
}

/**
 * Prefer truthful Sync items. If Runtime is READY and the Journal item exists,
 * activate it. Otherwise typed not_available / blocked_awaiting_sync.
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
    item?: NotificationItem | null;
    userId?: string;
  },
): {
  accepted: boolean;
  deferred: boolean;
  transitionId: string;
  outcome: DirectEntryOutcome;
  effects: RuntimeEffect[];
} {
  const transitionId =
    args.transitionId ?? nextRuntimeTransitionId('direct-entry');
  const state = store.getState();

  if (state.syncStatus !== 'READY') {
    return {
      accepted: false,
      deferred: false,
      transitionId,
      outcome: 'blocked_awaiting_sync',
      effects: [],
    };
  }

  const ids = candidateItemIds(args.targetId, args.targetKind);
  const found = ids.find((id) => state.itemsById[id]);
  if (!found) {
    return {
      accepted: false,
      deferred: false,
      transitionId,
      outcome: 'not_available',
      effects: [],
    };
  }

  // Explicit activation of the existing Journal item (not fabricated).
  if (state.activeItemId === found) {
    return {
      accepted: true,
      deferred: false,
      transitionId,
      outcome: 'activated',
      effects: [],
    };
  }

  // Claim via activate-ready only when found is the FIFO head, otherwise
  // leave as passive — deeplink policy does not invent jump-to without claim API.
  // Prefer dispatching ACTIVATE when passive head matches; else not_available jump.
  const head = state.passiveItemIds[0];
  if (head === found || state.activeItemId == null) {
    const result = store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: args.source ?? 'deeplink',
    });
    const activated = store.getState().activeItemId === found;
    return {
      accepted: activated,
      deferred: false,
      transitionId,
      outcome: activated ? 'activated' : 'not_available',
      effects: result.effects,
    };
  }

  return {
    accepted: false,
    deferred: false,
    transitionId,
    outcome: 'not_available',
    effects: [],
  };
}

export async function executeFetchDirectItemEffect(
  _store: NotificationRuntimeStore,
  _args: {
    targetId: string;
    targetKind: NotificationItemKind | null;
    transitionId: string;
    source?: RuntimeSource;
    userId: string;
  },
  _fetchItem: DirectItemTransport,
): Promise<void> {
  // No Runtime writes from Ban fetch — Sync is sole authority.
}

export function flushDeferredDirectEntry(
  _store: NotificationRuntimeStore,
  _source: RuntimeSource,
): RuntimeEffect[] {
  return [];
}

export function applyDirectItemReceived(
  _store: NotificationRuntimeStore,
  _args: {
    transitionId: string;
    item: NotificationItem;
    userId: string;
    source?: RuntimeSource;
  },
): DirectEntryOutcome {
  return 'blocked_awaiting_sync';
}
