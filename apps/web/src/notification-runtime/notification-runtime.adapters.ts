/**
 * Stage 7 Phase 1 — residual queue projections.
 * No Lobby/chrome/overlay policy. Compatibility write sinks removed from live path.
 */
import type { QueuedOverlay } from '@/lib/overlay-queue';
import type {
  NotificationItem,
  NotificationRuntimeState,
} from './notification-runtime.types';
import { notificationItemId } from './notification-runtime.types';
import { selectCurrentItem } from './notification-runtime.selectors';

export type LegacyDisplayProjection = {
  incomingBan: import('@98plus/shared').BanInteraction | null;
  checkBan: import('@98plus/shared').BanInteraction | null;
  result: import('@98plus/shared').BanResult | null;
  directResultOverlay: import('@98plus/shared').BanResult | null;
  directResultOverlayActive: boolean;
};

/** Queue → legacy overlay shape (read-only helper for residual tests). */
export function projectRuntimeQueueToLegacy(
  state: NotificationRuntimeState,
): QueuedOverlay[] {
  return state.items.queue.map((item) => {
    if (item.kind === 'result') return { kind: 'result', result: item.result };
    if (item.kind === 'check') return { kind: 'check', ban: item.ban };
    return { kind: 'incoming', ban: item.ban };
  });
}

export function projectRuntimeDisplayToLegacy(
  state: NotificationRuntimeState,
): LegacyDisplayProjection {
  const head = selectCurrentItem(state);
  if (!head) {
    return {
      incomingBan: null,
      checkBan: null,
      result: null,
      directResultOverlay: null,
      directResultOverlayActive: false,
    };
  }
  if (head.kind === 'result') {
    return {
      incomingBan: null,
      checkBan: null,
      result: head.result,
      directResultOverlay: null,
      directResultOverlayActive: false,
    };
  }
  if (head.kind === 'check') {
    return {
      incomingBan: null,
      checkBan: head.ban,
      result: null,
      directResultOverlay: null,
      directResultOverlayActive: false,
    };
  }
  return {
    incomingBan: head.ban,
    checkBan: null,
    result: null,
    directResultOverlay: null,
    directResultOverlayActive: false,
  };
}

export function projectRuntimeAdvanceSnapshot(state: NotificationRuntimeState): {
  queue: QueuedOverlay[];
  display: LegacyDisplayProjection;
  headId: string | null;
} {
  const head = selectCurrentItem(state);
  return {
    queue: projectRuntimeQueueToLegacy(state),
    display: projectRuntimeDisplayToLegacy(state),
    headId: head ? notificationItemId(head) : null,
  };
}

export function mapDismissReasonToCardReason(
  reason: string,
): 'user_dismiss' | 'close_result' | 'continue_chain' | 'system' {
  if (reason === 'close_result') return 'close_result';
  if (reason === 'continue_chain') return 'continue_chain';
  if (reason === 'system') return 'system';
  return 'user_dismiss';
}

export type { NotificationItem };
