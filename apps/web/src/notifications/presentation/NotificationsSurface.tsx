/**
 * Notifications presentation surface — exclusive mount while NOTIFICATIONS owns.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { NotificationsController } from '../notifications.controller';
import type { NotificationsIntent } from '../notifications.types';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
  type NotificationsUiEvent,
} from './notifications.presenter';
import { NotificationsScreen } from './NotificationsScreen';

export type NotificationsSurfaceProps = {
  controller: NotificationsController;
  onDomainIntent: (intent: NotificationsIntent) => void;
  onReleaseNotifications: () => void;
};

function useNotificationsState(controller: NotificationsController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
}

export function NotificationsSurface({
  controller,
  onDomainIntent,
  onReleaseNotifications,
}: NotificationsSurfaceProps) {
  const state = useNotificationsState(controller);
  const viewState = presentNotificationsState(state);

  const onEvent = useCallback(
    (event: NotificationsUiEvent) => {
      const mapped = mapNotificationsUiEvent(event);
      if (mapped.kind === 'DOMAIN') {
        onDomainIntent(mapped.intent);
        return;
      }
      // Clear activation claim before returning to prior owner.
      onDomainIntent({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED' });
      onReleaseNotifications();
    },
    [onDomainIntent, onReleaseNotifications],
  );

  return (
    <div data-surface-owner="NOTIFICATIONS">
      <NotificationsScreen viewState={viewState} onEvent={onEvent} />
    </div>
  );
}
