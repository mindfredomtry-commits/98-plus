/**
 * Coordinator-owned application surface.
 * Stage 8 Phase 2: presentation emits intents; Coordinator routes to Domain Port.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import { ProductFlowSurface } from '@/product-flow/product-flow.surface';

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
      lifecycle.dispatchDomainIntent('CREATE_BAN', intent);
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
        />
      </div>
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
