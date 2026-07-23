/**
 * Vertical 1 TEMP adapters — read-only projection from notification runtime
 * into legacy display/queue shapes.
 *
 * TEMP V1–V2: adapters MUST NOT:
 * - advance the queue
 * - clear display independently
 * - open lobby
 * - write back into the owner as an independent decision
 *
 * Delete when overlays read selectors directly.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';
import {
  selectCurrentItem,
  selectLobbyMayShow,
  selectOverlayVisible,
} from './notification-runtime.selectors';

export type LegacyDisplayProjection = {
  incomingBan: BanInteraction | null;
  checkBan: BanInteraction | null;
  result: BanResult | null;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
};

/** TEMP V1–V2: queue projection for InstantBanFlow / shell length. */
export function projectRuntimeQueueToLegacy(
  state: NotificationRuntimeState,
): QueuedOverlay[] {
  return state.items.queue.map((item): QueuedOverlay => {
    if (item.kind === 'result') {
      return { kind: 'result', result: item.result };
    }
    if (item.kind === 'check') {
      return { kind: 'check', ban: item.ban };
    }
    return { kind: 'incoming', ban: item.ban };
  });
}

/** TEMP V1–V2: display projection for existing overlay React stores. */
export function projectRuntimeDisplayToLegacy(
  state: NotificationRuntimeState,
): LegacyDisplayProjection {
  const payload = state.display.payload;
  const mode = state.display.mode;
  return {
    incomingBan:
      payload?.kind === 'incoming' ? payload.ban : null,
    checkBan: payload?.kind === 'check' ? payload.ban : null,
    result: payload?.kind === 'result' ? payload.result : null,
    directResultOverlay: mode === 'direct-overboard',
    directResultOverlayActive: mode === 'direct-overboard',
  };
}

export function projectRuntimeAdvanceSnapshot(
  state: NotificationRuntimeState,
): {
  queue: QueuedOverlay[];
  display: LegacyDisplayProjection;
  current: NotificationItem | null;
  currentId: string | null;
  overlayVisible: boolean;
  lobbyMayShow: boolean;
  lifecycleStatus: NotificationRuntimeState['lifecycle']['status'];
} {
  const current = selectCurrentItem(state);
  return {
    queue: projectRuntimeQueueToLegacy(state),
    display: projectRuntimeDisplayToLegacy(state),
    current,
    currentId: current ? notificationItemId(current) : null,
    overlayVisible: selectOverlayVisible(state),
    lobbyMayShow: selectLobbyMayShow(state),
    lifecycleStatus: state.lifecycle.status,
  };
}

export function mapDismissReasonToCardReason(
  reason: string,
): 'user_dismiss' | 'go_to_bans' | 'close_result' | 'continue_chain' | 'system' {
  const r = reason.toLowerCase();
  if (r.includes('go-to-bans') || r.includes('gotobans') || r.includes('result-cta')) {
    return 'go_to_bans';
  }
  if (r.includes('result-dismiss') || r.includes('close-result') || r.includes('close_result')) {
    return 'close_result';
  }
  if (r.includes('continue') || r.includes('incoming-seen')) {
    return 'continue_chain';
  }
  if (r.includes('incoming-dismiss') || r.includes('user-answer') || r.includes('user')) {
    return 'user_dismiss';
  }
  return 'system';
}
