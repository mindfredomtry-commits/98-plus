/**
 * Notifications presentation surface — exclusive mount while NOTIFICATIONS owns.
 *
 * Close: domain ACTIVE_ITEM_CLOSE_REQUESTED only. Owner release is solely via
 * Runtime SESSION_COMPLETE → controller sink → NOTIFICATIONS_RELEASE_REQUESTED.
 *
 * Remount key includes presentationSessionGeneration + activationGeneration +
 * itemId so same-item Ban1 reopen is a new React instance.
 */
'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
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
import { rec } from '@/notifications/diagnostics/notifications-recorder-bridge';

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
  const remountKey =
    viewState.phase === 'ITEM'
      ? `${state.presentationSessionGeneration}:${state.activationGeneration}:${viewState.itemId}`
      : `empty:${state.presentationSessionGeneration}:${state.activationGeneration}`;
  const lastPresentedFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    rec('presenter', 'PRESENTER_CREATED', {
      metadata: { remountKey },
    });
    return () => {
      rec('presenter', 'PRESENTER_DISPOSED', {
        metadata: { remountKey },
      });
    };
  }, [remountKey]);

  useEffect(() => {
    const presentFingerprint =
      viewState.phase === 'ITEM'
        ? `ITEM:${viewState.itemId}:${viewState.activationGeneration}:${viewState.presentationSessionGeneration}`
        : `EMPTY:${state.activationGeneration}:${state.presentationSessionGeneration}`;
    rec('presenter', 'PRESENTER_INPUT', {
      stateBefore: {
        activeItemId: state.activeItem?.itemId ?? null,
        activation:
          state.activation.type === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        activationGeneration: state.activationGeneration,
        presentationSessionGeneration: state.presentationSessionGeneration,
      },
    });
    if (presentFingerprint === lastPresentedFingerprintRef.current) {
      rec('presenter', 'PRESENTER_OUTPUT_DEDUPED', {
        metadata: { fingerprint: presentFingerprint },
      });
    } else {
      lastPresentedFingerprintRef.current = presentFingerprint;
      rec(
        'presenter',
        viewState.phase === 'ITEM'
          ? 'PRESENTER_OUTPUT_ITEM'
          : 'PRESENTER_OUTPUT_EMPTY',
        {
          stateAfter: {
            viewPhase: viewState.phase,
            itemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
            activationGeneration: state.activationGeneration,
            presentationSessionGeneration:
              state.presentationSessionGeneration,
          },
        },
      );
    }
    rec('NotificationsSurface', 'NOTIFICATION_CARD_RENDER', {
      stateAfter: {
        remountKey,
        viewPhase: viewState.phase,
        itemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
        activationGeneration: state.activationGeneration,
        presentationSessionGeneration: state.presentationSessionGeneration,
      },
    });
  }, [
    remountKey,
    state.activeItem?.itemId,
    state.activation.type,
    state.activationGeneration,
    state.presentationSessionGeneration,
    viewState.phase,
    viewState.phase === 'ITEM' ? viewState.itemId : null,
  ]);

  useEffect(() => {
    const diagId = nextNotificationsSyncCorrelationId('surface');
    const instanceId = `card:${state.presentationSessionGeneration}:${state.activationGeneration}`;
    logNotificationsSyncDiag(diagId, 'NOTIFICATION_SURFACE_MOUNT', {
      phase: 'mount',
      remountKey,
      activationGeneration: state.activationGeneration,
      presentationSessionGeneration: state.presentationSessionGeneration,
      domainActiveItemId: state.activeItem?.itemId ?? null,
      viewPhase: viewState.phase,
      viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
    });
    logNotificationsSyncDiag(diagId, 'SURFACE_MOUNT_OR_UPDATE', {
      phase: 'mount',
      remountKey,
      activationGeneration: state.activationGeneration,
      presentationSessionGeneration: state.presentationSessionGeneration,
      viewPhase: viewState.phase,
      viewItemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
    });
    rec('NotificationsSurface', 'NOTIFICATION_HOST_MOUNT', {
      stateAfter: {
        remountKey,
        viewPhase: viewState.phase,
        itemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
        activationGeneration: state.activationGeneration,
        presentationSessionGeneration: state.presentationSessionGeneration,
      },
    });
    if (viewState.phase === 'ITEM') {
      rec('NotificationsSurface', 'NOTIFICATION_CARD_INSTANCE_CREATED', {
        stateAfter: {
          instanceId,
          remountKey,
          itemId: viewState.itemId,
          activationGeneration: state.activationGeneration,
          presentationSessionGeneration: state.presentationSessionGeneration,
        },
      });
      rec('NotificationsSurface', 'NOTIFICATION_CARD_MOUNT', {
        stateAfter: {
          instanceId,
          remountKey,
          itemId: viewState.itemId,
          cardMounted: true,
        },
      });
    }
    return () => {
      logNotificationsSyncDiag(diagId, 'SURFACE_MOUNT_OR_UPDATE', {
        phase: 'unmount',
        remountKey,
        activationGeneration: state.activationGeneration,
        presentationSessionGeneration: state.presentationSessionGeneration,
      });
      rec('NotificationsSurface', 'NOTIFICATION_CARD_UNMOUNT', {
        metadata: { remountKey, instanceId },
      });
      rec('NotificationsSurface', 'NOTIFICATION_HOST_UNMOUNT', {
        metadata: { remountKey },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remountKey]);

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
            presentationSessionGeneration:
              before.presentationSessionGeneration,
            domainActiveItemId: before.activeItem?.itemId ?? null,
          });
          logNotificationsSyncDiag(diagId, 'CLOSE_SURFACE_EVENT', {
            mappedKind: mapped.kind,
            mappedIntent: mapped.intent,
            releaseProducer: 'SESSION_COMPLETE_ONLY',
          });
          rec('NotificationsSurface', 'NOTIFICATION_CARD_CLOSE_CLICK', {
            stateBefore: {
              viewPhase: viewState.phase,
              itemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
              activationGeneration: before.activationGeneration,
              presentationSessionGeneration:
                before.presentationSessionGeneration,
            },
          });
          rec(
            'NotificationsSurface',
            'NOTIFICATION_CARD_CLOSE_INTENT_DISPATCHED',
            {
              metadata: { intent: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
            },
          );
          rec('runtime', 'RUNTIME_CLOSE_RECEIVED', {
            stateBefore: {
              activeItemId: before.activeItem?.itemId ?? null,
              presentationSessionGeneration:
                before.presentationSessionGeneration,
            },
          });
        }
        onDomainIntent(mapped.intent);
        return;
      }
      const diagId = nextNotificationsSyncCorrelationId('close');
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
      data-presentation-session-generation={
        state.presentationSessionGeneration
      }
      data-visible-item={viewState.phase === 'ITEM' ? viewState.itemId : ''}
      data-remount-key={remountKey}
    >
      <NotificationsScreen
        key={remountKey}
        viewState={viewState}
        onEvent={onEvent}
        onClosePointerDown={() => {
          rec('NotificationsSurface', 'NOTIFICATION_CARD_CLOSE_POINTER_DOWN', {
            stateBefore: {
              viewPhase: viewState.phase,
              itemId: viewState.phase === 'ITEM' ? viewState.itemId : null,
            },
          });
        }}
      />
    </div>
  );
}
