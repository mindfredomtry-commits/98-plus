/**
 * Coordinator-owned application surface.
 * Stage 8 Phase 5/9H: exclusive mount from currentOwner.
 *
 * NOTIFICATIONS owner with EMPTY presenter is an invariant violation
 * (never silently fall back to Lobby).
 */
'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import { ProductFlowSurface } from '@/product-flow/product-flow.surface';
import type { SettingsIntent } from '@/settings/settings.types';
import { SettingsSurface } from '@/settings/presentation/SettingsSurface';
import type { NotificationsIntent } from '@/notifications/notifications.types';
import { NotificationsSurface } from '@/notifications/presentation/NotificationsSurface';
import { presentNotificationsState } from '@/notifications/presentation/notifications.presenter';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';

export type ApplicationSurfaceProps = {
  lifecycle: AppCoordinatorLifecycle | null;
  loading: boolean;
  user: UserPublic | null;
  getToken: () => string | null;
};

type ActiveApplicationSurfaceProps = Omit<
  ApplicationSurfaceProps,
  'lifecycle' | 'loading'
> & {
  lifecycle: AppCoordinatorLifecycle;
};

function BootSurface() {
  return (
    <div
      className="app-coordinator-boot pt-16 text-center text-muted text-sm"
      data-surface-owner="BOOT"
    >
      Загрузка…
    </div>
  );
}

function NotificationsInvariantSurface({
  detail,
}: {
  detail: Record<string, unknown>;
}) {
  return (
    <div
      className="app-coordinator-invariant pt-16 px-4 text-center text-sm text-red-600"
      data-surface-owner="NOTIFICATIONS"
      data-invariant="OWNER_PRESENTATION_INVARIANT_VIOLATION"
      data-testid="notifications-owner-invariant"
    >
      OWNER_PRESENTATION_INVARIANT_VIOLATION
      <pre className="mt-2 text-left text-xs overflow-auto">
        {JSON.stringify(detail, null, 2)}
      </pre>
    </div>
  );
}

function ActiveApplicationSurface({
  lifecycle,
  user,
}: ActiveApplicationSurfaceProps) {
  const coordinatorState = useSyncExternalStore(
    (onStoreChange) =>
      lifecycle.store.subscribe(() => {
        onStoreChange();
      }),
    lifecycle.store.getState,
    lifecycle.store.getState,
  );

  const notificationsState = useSyncExternalStore(
    (onStoreChange) =>
      lifecycle.notificationsController.subscribe(() => onStoreChange()),
    lifecycle.notificationsController.getState,
    lifecycle.notificationsController.getState,
  );

  const onCreateBanIntent = useCallback(
    (intent: CreateBanUiIntent) => {
      lifecycle.dispatchDomainIntent({ domain: 'CREATE_BAN', intent });
    },
    [lifecycle],
  );

  const onOpenSettings = useCallback(() => {
    lifecycle.dispatch({ type: 'OPEN_SETTINGS_REQUESTED' });
  }, [lifecycle]);

  const onOpenNotifications = useCallback(() => {
    const correlationId = nextNotificationsSyncCorrelationId('open');
    logNotificationsSyncDiag(correlationId, 'LOBBY_CTA_CLICK', {
      source: 'ApplicationSurface.onOpenNotifications',
      label: 'Твои запреты',
      currentOwner: (() => {
        const o = lifecycle.store.getState().currentOwner;
        return o.type === 'DOMAIN' ? o.domain : o.type;
      })(),
    });
    lifecycle.openNotifications(correlationId);
  }, [lifecycle]);

  const onSettingsIntent = useCallback(
    (intent: SettingsIntent) => {
      lifecycle.dispatchDomainIntent({ domain: 'SETTINGS', intent });
    },
    [lifecycle],
  );

  const onCloseSettings = useCallback(() => {
    lifecycle.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
  }, [lifecycle]);

  const onNotificationsIntent = useCallback(
    (intent: NotificationsIntent) => {
      lifecycle.dispatchDomainIntent({ domain: 'NOTIFICATIONS', intent });
    },
    [lifecycle],
  );

  const owner = coordinatorState.currentOwner;

  if (owner.type === 'BOOT') {
    return <BootSurface />;
  }

  if (owner.domain === 'CREATE_BAN') {
    return (
      <div data-surface-owner="CREATE_BAN">
        <ProductFlowSurface
          controller={lifecycle.productController}
          user={user}
          influencePercent={user?.energyPercent ?? 0}
          onIntent={onCreateBanIntent}
          onOpenSettings={onOpenSettings}
          onOpenNotifications={onOpenNotifications}
        />
      </div>
    );
  }

  if (owner.domain === 'SETTINGS') {
    return (
      <SettingsSurface
        controller={lifecycle.settingsController}
        onDomainIntent={onSettingsIntent}
        onCloseSettings={onCloseSettings}
      />
    );
  }

  if (owner.domain === 'NOTIFICATIONS') {
    const view = presentNotificationsState(notificationsState);
    if (view.phase !== 'ITEM') {
      const detail = {
        code: 'OWNER_PRESENTATION_INVARIANT_VIOLATION',
        currentOwner: 'NOTIFICATIONS',
        viewPhase: view.phase,
        activation: notificationsState.activation,
        activeItemId: notificationsState.activeItem?.itemId ?? null,
        activationGeneration: notificationsState.activationGeneration,
        presentationSessionGeneration:
          notificationsState.presentationSessionGeneration,
        lastActivationOutcome: notificationsState.lastActivationOutcome,
      };
      logNotificationsSyncDiag(
        nextNotificationsSyncCorrelationId('surface'),
        'OWNER_PRESENTATION_INVARIANT_VIOLATION',
        detail,
      );
      return <NotificationsInvariantSurface detail={detail} />;
    }
    logNotificationsSyncDiag(
      nextNotificationsSyncCorrelationId('surface'),
      'APPLICATION_SURFACE_BRANCH',
      {
        branch: 'NOTIFICATIONS',
        viewPhase: view.phase,
        viewItemId: view.itemId,
        activationGeneration: notificationsState.activationGeneration,
        presentationSessionGeneration:
          notificationsState.presentationSessionGeneration,
      },
    );
    return (
      <NotificationsSurface
        controller={lifecycle.notificationsController}
        onDomainIntent={onNotificationsIntent}
      />
    );
  }

  return <BootSurface />;
}

export function ApplicationSurface(props: ApplicationSurfaceProps) {
  if (!props.lifecycle || props.loading) {
    return <BootSurface />;
  }
  return <ActiveApplicationSurface {...props} lifecycle={props.lifecycle} />;
}
