/**
 * Coordinator-owned application surface.
 * Stage 7 Phase 3: Boot or Product only.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
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

  const onStartBan = useCallback(() => {
    lifecycle.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
  }, [lifecycle]);

  if (coordinatorState.mode.type === 'BOOTING') {
    return <BootSurface />;
  }

  return (
    <div data-surface-owner="PRODUCT_FLOW">
      <ProductFlowSurface
        controller={lifecycle.productController}
        user={user}
        influencePercent={user?.energyPercent ?? 0}
        onComposeRequested={onStartBan}
      />
    </div>
  );
}

export function ApplicationSurface(props: ApplicationSurfaceProps) {
  if (!props.lifecycle || props.loading) {
    return <BootSurface />;
  }
  return <ActiveApplicationSurface {...props} lifecycle={props.lifecycle} />;
}
