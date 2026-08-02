/**
 * Coordinator-owned application surface.
 * Stage 8 Phase 4: exclusive mount from currentOwner (CREATE_BAN | SETTINGS).
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import { ProductFlowSurface } from '@/product-flow/product-flow.surface';
import type { SettingsIntent } from '@/settings/settings.types';
import { SettingsSurface } from '@/settings/presentation/SettingsSurface';

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
    lifecycle.store.subscribe,
    lifecycle.store.getState,
    lifecycle.store.getState,
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

  const onSettingsIntent = useCallback(
    (intent: SettingsIntent) => {
      lifecycle.dispatchDomainIntent({ domain: 'SETTINGS', intent });
    },
    [lifecycle],
  );

  const onCloseSettings = useCallback(() => {
    lifecycle.dispatch({ type: 'CLOSE_SETTINGS_REQUESTED' });
  }, [lifecycle]);

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

  return <BootSurface />;
}

export function ApplicationSurface(props: ApplicationSurfaceProps) {
  if (!props.lifecycle || props.loading) {
    return <BootSurface />;
  }
  return <ActiveApplicationSurface {...props} lifecycle={props.lifecycle} />;
}
