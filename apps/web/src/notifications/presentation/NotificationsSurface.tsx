/**
 * Notifications presentation surface — exclusive mount while NOTIFICATIONS owns.
 *
 * Close: domain ACTIVE_ITEM_CLOSE_REQUESTED only. Owner release is solely via
 * Runtime SESSION_COMPLETE → controller sink → NOTIFICATIONS_RELEASE_REQUESTED.
 */
'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { NotificationsController } from '../notifications.controller';
import type { NotificationsIntent } from '../notifications.types';
import {
  mapNotificationsUiEvent,
  presentNotificationsState,
  type NotificationsUiEvent,
} from './notifications.presenter';
import { NotificationsScreen } from './NotificationsScreen';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';

export type NotificationsSurfaceProps = {
  controller: NotificationsController;
  onDomainIntent: (intent: NotificationsIntent) => void;
  /** @deprecated Close release is SESSION_COMPLETE-only; ignored if passed. */
  onReleaseNotifications?: () => void;
};

function useNotificationsState(controller: NotificationsController) {
  return useSyncExternalStore(
    (onStoreChange) => controller.subscribe(() => onStoreChange()),
    controller.getState,
    controller.getState,
  );
}

export function NotificationsSurface({
  controller,
  onDomainIntent,
}: NotificationsSurfaceProps) {
  const state = useNotificationsState(controller);
  const viewState = presentNotificationsState(state);

  useEffect(() => {
    const diagId = nextNotificationsSyncCorrelationId('surface');
    logNotificationsSyncDiag(diagId, 'SURFACE_MOUNT_OR_UPDATE', {
      phase: 'mount',
      activationGeneration: state.activationGeneration,
      domainActiveItemId: state.activeItem?.itemId ?? null,
      viewPhase: viewState.phase,
      viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
    });
    return () => {
      logNotificationsSyncDiag(diagId, 'SURFACE_MOUNT_OR_UPDATE', {
        phase: 'unmount',
        activationGeneration: state.activationGeneration,
        domainActiveItemId: state.activeItem?.itemId ?? null,
      });
    };
    // Mount/unmount only — generation changes remount Screen via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.activation.type !== 'ACTIVE') return;
    logNotificationsSyncDiag(
      nextNotificationsSyncCorrelationId('surface'),
      'PRESENTER_VIEW_AFTER_ACTIVATION',
      {
        source: 'NotificationsSurface',
        viewPhase: viewState.phase,
        viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
        activationGeneration: state.activationGeneration,
        domainActiveItemId: state.activeItem?.itemId ?? null,
      },
    );
  }, [
    state.activation,
    state.activationGeneration,
    state.activeItem?.itemId,
    viewState,
  ]);

  const onEvent = useCallback(
    (event: NotificationsUiEvent) => {
      const mapped = mapNotificationsUiEvent(event);
      if (mapped.kind === 'DOMAIN') {
        if (mapped.intent.type === 'ACTIVE_ITEM_CLOSE_REQUESTED') {
          const diagId = nextNotificationsSyncCorrelationId('close');
          const before = controller.getState();
          logNotificationsSyncDiag(diagId, 'CLOSE_BUTTON_PRESSED', {
            viewPhase: viewState.phase,
            viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
            activationGeneration: before.activationGeneration,
            domainActiveItemId: before.activeItem?.itemId ?? null,
          });
          logNotificationsSyncDiag(diagId, 'CLOSE_SURFACE_EVENT', {
            mappedKind: mapped.kind,
            mappedIntent: mapped.intent,
            releaseProducer: 'SESSION_COMPLETE_ONLY',
          });
        }
        onDomainIntent(mapped.intent);
        return;
      }
      // Legacy APPLICATION close mapping — still domain-only (no dual release).
      const diagId = nextNotificationsSyncCorrelationId('close');
      const before = controller.getState();
      logNotificationsSyncDiag(diagId, 'CLOSE_BUTTON_PRESSED', {
        viewPhase: viewState.phase,
        viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
        activationGeneration: before.activationGeneration,
        domainActiveItemId: before.activeItem?.itemId ?? null,
        legacyApplicationIntent: mapped.intent,
      });
      logNotificationsSyncDiag(diagId, 'CLOSE_SURFACE_EVENT', {
        mappedKind: 'DOMAIN',
        mappedIntent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
        releaseProducer: 'SESSION_COMPLETE_ONLY',
        suppressedApplicationRelease: true,
      });
      onDomainIntent({ type: 'ACTIVE_ITEM_CLOSE_REQUESTED' });
    },
    [onDomainIntent, controller, viewState],
  );

  return (
    <div
      data-surface-owner="NOTIFICATIONS"
      data-activation-generation={state.activationGeneration}
      data-visible-item={viewState.phase === 'ITEM' ? viewState.itemId : ''}
    >
      <NotificationsScreen
        key={state.activationGeneration}
        viewState={viewState}
        onEvent={onEvent}
      />
    </div>
  );
}
