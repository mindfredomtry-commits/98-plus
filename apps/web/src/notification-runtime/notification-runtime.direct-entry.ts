/**
 * Stage 8 correction — deeplink entry must not invent Runtime items.
 * Fetch may still run for non-Runtime hosts; Runtime collection stays closed.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
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
  | 'rejected'
  | 'blocked_awaiting_sync';

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
  _store: NotificationRuntimeStore,
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
  // Do not write fabricated items into Runtime.
  return {
    accepted: false,
    deferred: false,
    transitionId,
    outcome: 'blocked_awaiting_sync',
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
  // Intentionally empty — no Runtime writes without journal Sync.
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
