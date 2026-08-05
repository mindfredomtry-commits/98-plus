/**
 * Coordinator-owned application surface.
 * Stage 8 Phase 5: exclusive mount from currentOwner
 * (CREATE_BAN | SETTINGS | NOTIFICATIONS).
 */
'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import { ProductFlowSurface } from '@/product-flow/product-flow.surface';
import type { SettingsIntent } from '@/settings/settings.types';
import { SettingsSurface } from '@/settings/presentation/SettingsSurface';
import type { NotificationsIntent } from '@/notifications/notifications.types';
import { NotificationsSurface } from '@/notifications/presentation/NotificationsSurface';
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
  const notificationsSessionSeenRef = useRef(false);

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
    const owner = lifecycle.store.getState().currentOwner;
    if (
      notificationsSessionSeenRef.current &&
      owner.type === 'DOMAIN' &&
      owner.domain === 'CREATE_BAN'
    ) {
      logNotificationsSyncDiag(
        nextNotificationsSyncCorrelationId('open2'),
        'SECOND_NOTIFICATIONS_BUTTON_PRESSED',
        {
          ownerBefore: 'CREATE_BAN',
          returnOwner: lifecycle.store.getState().returnOwner
            ? lifecycle.store.getState().returnOwner!.type === 'DOMAIN'
              ? (
                  lifecycle.store.getState().returnOwner as {
                    domain: string;
                  }
                ).domain
              : lifecycle.store.getState().returnOwner!.type
            : null,
        },
      );
    }
    lifecycle.dispatch({ type: 'OPEN_NOTIFICATIONS_REQUESTED' });
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

  useEffect(() => {
    if (owner.type === 'DOMAIN' && owner.domain === 'NOTIFICATIONS') {
      notificationsSessionSeenRef.current = true;
    }
  }, [owner]);

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
