/**
 * Vertical V1 — Lobby claim single-owner.
 *
 * Product lobby / chrome / notification-screen claim must come only from
 * notification-runtime selectors. Legacy queue-lobby-guard, owner queue length,
 * overlay length, and shell-result flags must not decide chrome.
 */
import {
  selectInteractiveLobbyChromeMayShow,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '@/notification-runtime/notification-runtime.selectors';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export type LobbyClaimFromRuntime = {
  /** True when runtime overlay lifecycle owns the notification screen. */
  claimsNotificationScreen: boolean;
  /** Interactive top-nav / CTA / atmosphere may paint. */
  chromeMayShow: boolean;
  /** Strict idle lobby open authority. */
  lobbyMayShow: boolean;
};

export function decideLobbyClaimFromRuntime(
  state: NotificationRuntimeState,
): LobbyClaimFromRuntime {
  return {
    claimsNotificationScreen: selectOverlayVisible(state),
    chromeMayShow: selectInteractiveLobbyChromeMayShow(state),
    lobbyMayShow: selectLobbyMayShow(state),
  };
}
