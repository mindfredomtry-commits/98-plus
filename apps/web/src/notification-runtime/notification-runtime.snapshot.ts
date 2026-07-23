/**
 * Vertical 2 — single UI snapshot from notification runtime store.
 */
import {
  selectCurrentItem,
  selectCurrentItemId,
  selectLobbyMayShow,
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
  lobbyMayShow: boolean;
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
    lobbyMayShow: selectLobbyMayShow(state),
    queueLength: state.items.queue.length,
  };
}
