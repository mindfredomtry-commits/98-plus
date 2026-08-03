/**
 * Stage 8 Phase 8 — deeplink / live-single direct entry via temporary adapter.
 * Does not activate; does not clear Runtime collections.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import { receiveNotificationItem } from './notification-runtime.ingest';
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

export type DirectEntrySource = 'deeplink' | 'live-single';
export type DirectReturnPolicy = 'retain_queue';

export type DirectEntryOutcome =
  | 'queued'
  | 'idle'
  | 'deferred'
  | 'failed'
  | 'rejected';

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
  const source: RuntimeSource =
    args.source ??
    (args.entrySource === 'live-single' ? 'websocket' : 'deeplink');

  if (args.defer) {
    return {
      accepted: true,
      deferred: true,
      transitionId,
      outcome: 'deferred',
      effects: [],
    };
  }

  if (args.item && args.userId) {
    receiveNotificationItem(store, {
      item: args.item,
      source,
      userId: args.userId,
      transitionId,
    });
    return {
      accepted: true,
      deferred: false,
      transitionId,
      outcome: 'queued',
      effects: [],
    };
  }

  // Fetch effect — caller runs executeFetchDirectItemEffect
  return {
    accepted: true,
    deferred: false,
    transitionId,
    outcome: 'queued',
    effects: [],
  };
}

export async function executeFetchDirectItemEffect(
  store: NotificationRuntimeStore,
  args: {
    targetId: string;
    targetKind: NotificationItemKind | null;
    transitionId: string;
    source?: RuntimeSource;
    userId: string;
  },
  fetchItem: DirectItemTransport,
): Promise<void> {
  try {
    const item = await fetchItem({
      targetId: args.targetId,
      targetKind: args.targetKind,
    });
    receiveNotificationItem(store, {
      item,
      source: args.source ?? 'deeplink',
      userId: args.userId,
      transitionId: args.transitionId,
    });
  } catch {
    // Soft-fail direct fetch — do not clear Runtime.
  }
}

export function flushDeferredDirectEntry(
  _store: NotificationRuntimeStore,
  _source: RuntimeSource,
): RuntimeEffect[] {
  return [];
}

export function applyDirectItemReceived(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    item: NotificationItem;
    userId: string;
    source?: RuntimeSource;
  },
): DirectEntryOutcome {
  receiveNotificationItem(store, {
    item: args.item,
    source: args.source ?? 'deeplink',
    userId: args.userId,
    transitionId: args.transitionId,
  });
  return 'queued';
}
