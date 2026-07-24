/**
 * Vertical 2 — single UI snapshot from notification runtime store.
 */
import {
  selectCurrentItem,
  selectCurrentItemId,
  selectHoldLobbyOrbForBootstrap,
  selectInteractiveLobbyChromeMayShow,
  selectLobbyMayShow,
  selectNotificationClaimsScreen,
  selectOverlayVisible,
} from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';
import { projectRuntimeDisplayToLegacy } from './notification-runtime.adapters';

export type NotificationRuntimeUiSnapshot = {
  state: NotificationRuntimeState;
  lifecycleStatus: NotificationRuntimeState['lifecycle']['status'];
  current: ReturnType<typeof selectCurrentItem>;
  currentId: string | null;
  display: ReturnType<typeof projectRuntimeDisplayToLegacy>;
  overlayVisible: boolean;
  /** True only when a renderable runtime display owns the screen. */
  notificationClaimsScreen: boolean;
  lobbyMayShow: boolean;
  interactiveLobbyChromeMayShow: boolean;
  holdLobbyOrbForBootstrap: boolean;
  queueLength: number;
};

export function selectNotificationRuntimeUiSnapshot(
  state: NotificationRuntimeState,
): NotificationRuntimeUiSnapshot {
  return {
    state,
    lifecycleStatus: state.lifecycle.status,
    current: selectCurrentItem(state),
    currentId: selectCurrentItemId(state),
    display: projectRuntimeDisplayToLegacy(state),
    overlayVisible: selectOverlayVisible(state),
    notificationClaimsScreen: selectNotificationClaimsScreen(state),
    lobbyMayShow: selectLobbyMayShow(state),
    interactiveLobbyChromeMayShow: selectInteractiveLobbyChromeMayShow(state),
    holdLobbyOrbForBootstrap: selectHoldLobbyOrbForBootstrap(state),
    queueLength: state.items.queue.length,
  };
}
