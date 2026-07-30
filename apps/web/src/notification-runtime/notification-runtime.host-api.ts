/**
 * Phase 0 — narrow public Host ↔ Runtime contract.
 * UI must not import reducer events, generation IDs, or legacy refs.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  selectCurrentItem,
  selectHasNext,
  selectIndicatorVisible,
  selectInteractiveLobbyChromeMayShow,
  selectIsActionBlocked,
  selectIsBooting,
  selectIsRecovering,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from './notification-runtime.selectors';
import {
  notificationItemId,
  type DisplayMode,
  type NotificationItem,
  type NotificationRuntimeState,
} from './notification-runtime.types';

export type NotificationHostPhase =
  | 'LOBBY'
  | 'INCOMING'
  | 'CHECK'
  | 'RESULT'
  | 'BOOTING'
  | 'RECOVERING';

export type NotificationCard =
  | { kind: 'incoming'; itemId: string; ban: BanInteraction; mode: DisplayMode }
  | { kind: 'check'; itemId: string; ban: BanInteraction; mode: DisplayMode }
  | { kind: 'result'; itemId: string; result: BanResult; mode: DisplayMode };

export type NotificationViewState = {
  phase: NotificationHostPhase;
  currentCard: NotificationCard | null;
  queueLength: number;
  pendingCount: number;
  ctaVisible: boolean;
  indicatorVisible: boolean;
  isProcessingAction: boolean;
  hasNext: boolean;
  lobbyMayShow: boolean;
  interactiveLobbyChromeMayShow: boolean;
};

export type NotificationIntentResult = {
  accepted: boolean;
  reason?: string;
};

/**
 * Public intents. Host/UI never dispatches raw reducer events.
 * `reply` is a product-compose handoff signal (runtime has no incoming_reply executor yet).
 */
export type NotificationIntents = {
  accept(): Promise<NotificationIntentResult>;
  confirmCheck(completed: boolean): Promise<NotificationIntentResult>;
  dismissResult(reason?: 'close_result' | 'go_to_bans' | 'continue_chain'): Promise<NotificationIntentResult>;
  dismissCurrent(reason?: 'user_dismiss' | 'system'): Promise<NotificationIntentResult>;
  /** Compose-domain handoff — does not mutate runtime queue by itself. */
  reply(): NotificationIntentResult;
  openBansCta(): NotificationIntentResult;
  refresh(reason?: 'bootstrap' | 'reconnect' | 'user'): Promise<NotificationIntentResult>;
};

function cardFromItem(
  item: NotificationItem,
  mode: DisplayMode,
): NotificationCard {
  const itemId = notificationItemId(item);
  if (item.kind === 'result') {
    return { kind: 'result', itemId, result: item.result, mode };
  }
  if (item.kind === 'check') {
    return { kind: 'check', itemId, ban: item.ban, mode };
  }
  return { kind: 'incoming', itemId, ban: item.ban, mode };
}

/**
 * Sole host-facing view selector. Uses display.payload when present;
 * falls back to queue head. Never exposes pending generation / legacy paint.
 */
export function selectNotificationViewState(
  state: NotificationRuntimeState,
  opts?: {
    /** Boot intro primed (product shell). Default true for headless tests. */
    lobbyBootIntroPrimed?: boolean;
    /** Compose / send / SUCCESS product blockers. */
    hostBlocksCta?: boolean;
  },
): NotificationViewState {
  const lobbyBootIntroPrimed = opts?.lobbyBootIntroPrimed ?? true;
  const hostBlocksCta = opts?.hostBlocksCta ?? false;
  const lobbyMayShow = selectLobbyMayShow(state);
  const interactiveLobbyChromeMayShow =
    selectInteractiveLobbyChromeMayShow(state);
  const overlayVisible = selectOverlayVisible(state);
  const isProcessingAction = selectIsActionBlocked(state);
  const pendingCount = selectPendingCount(state);
  const indicatorVisible = selectIndicatorVisible(state);
  const hasNext = selectHasNext(state);
  const queueLength = state.items.queue.length;

  const payload = state.display.payload;
  const head = selectCurrentItem(state);
  const mode = state.display.mode;
  let currentCard: NotificationCard | null = null;
  if (payload) {
    if (payload.kind === 'result') {
      currentCard = {
        kind: 'result',
        itemId: notificationItemId({ kind: 'result', result: payload.result }),
        result: payload.result,
        mode,
      };
    } else if (payload.kind === 'check') {
      currentCard = {
        kind: 'check',
        itemId: notificationItemId({ kind: 'check', ban: payload.ban }),
        ban: payload.ban,
        mode,
      };
    } else {
      currentCard = {
        kind: 'incoming',
        itemId: notificationItemId({ kind: 'incoming', ban: payload.ban }),
        ban: payload.ban,
        mode,
      };
    }
  } else if (head && overlayVisible) {
    currentCard = cardFromItem(head, mode);
  }

  let phase: NotificationHostPhase;
  if (selectIsBooting(state) && !currentCard) {
    phase = 'BOOTING';
  } else if (selectIsRecovering(state) && !currentCard) {
    phase = 'RECOVERING';
  } else if (currentCard?.kind === 'incoming') {
    phase = 'INCOMING';
  } else if (currentCard?.kind === 'check') {
    phase = 'CHECK';
  } else if (currentCard?.kind === 'result') {
    phase = 'RESULT';
  } else {
    phase = 'LOBBY';
  }

  const ctaVisible =
    lobbyBootIntroPrimed &&
    !hostBlocksCta &&
    interactiveLobbyChromeMayShow &&
    phase === 'LOBBY' &&
    !currentCard;

  return {
    phase,
    currentCard,
    queueLength,
    pendingCount,
    ctaVisible,
    indicatorVisible,
    isProcessingAction,
    hasNext,
    lobbyMayShow,
    interactiveLobbyChromeMayShow,
  };
}
