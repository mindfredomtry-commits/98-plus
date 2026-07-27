/**
 * Live cutover ingest: park items on the owner queue, then claim when Lobby is idle.
 * Compose / SUCCESS paths keep parked items until CLOSE_SUCCESS (Flow C).
 */

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueueItem } from './notification-owner.types';
import {
  dispatchNotificationOwner,
  getNotificationOwnerState,
} from './notification-owner.store';
import {
  queueItemFromCheck,
  queueItemFromIncoming,
  queueItemFromResult,
} from './notification-owner.ingest';

export function ingestAndClaimIfLobby(items: QueueItem[]): void {
  if (items.length === 0) return;
  dispatchNotificationOwner({ type: 'ITEMS_INGESTED', items });
  if (getNotificationOwnerState().presentation.kind === 'LOBBY') {
    dispatchNotificationOwner({ type: 'CLAIM_NEXT' });
  }
}

/** Sole queue-mutation entrypoint for raw network/session ingestion (no claim). */
export function ingestItems(items: QueueItem[]): void {
  if (items.length === 0) return;
  dispatchNotificationOwner({ type: 'ITEMS_INGESTED', items });
}

export type QueuedOverlayIngestPayload =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

/** Map a legacy overlay payload to an owner QueueItem and ingest it. */
export function ingestQueuedOverlay(item: QueuedOverlayIngestPayload): void {
  const queueItem: QueueItem =
    item.kind === 'incoming'
      ? queueItemFromIncoming(item.ban)
      : item.kind === 'check'
        ? queueItemFromCheck(item.ban)
        : queueItemFromResult(item.result);
  ingestAndClaimIfLobby([queueItem]);
}
