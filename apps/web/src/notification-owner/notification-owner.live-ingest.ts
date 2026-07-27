/**
 * Live cutover ingest: park items on the owner queue, then claim when Lobby is idle.
 * Compose / SUCCESS paths keep parked items until CLOSE_SUCCESS (Flow C).
 */

import type { QueueItem } from './notification-owner.types';
import {
  dispatchNotificationOwner,
  getNotificationOwnerState,
} from './notification-owner.store';

export function ingestAndClaimIfLobby(items: QueueItem[]): void {
  if (items.length === 0) return;
  dispatchNotificationOwner({ type: 'ITEMS_INGESTED', items });
  if (getNotificationOwnerState().presentation.kind === 'LOBBY') {
    dispatchNotificationOwner({ type: 'CLAIM_NEXT' });
  }
}
