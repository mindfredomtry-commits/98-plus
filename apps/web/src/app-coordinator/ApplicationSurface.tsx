/**
 * Coordinator-owned application surface.
 * Exactly one global surface owner at a time.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { UserPublic } from '@98plus/shared';
import { selectReplyCompose } from '@/app-coordinator/app-coordinator.selectors';
import type { AppCoordinatorLifecycle } from '@/app-coordinator/app-coordinator.lifecycle';
import {
  DirectNotificationHost,
  type DirectNotificationHostProps,
} from '@/notification-host/DirectNotificationHost';
import { selectCurrentItem } from '@/notification-runtime/notification-runtime.selectors';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import { notificationItemId } from '@/notification-runtime/notification-runtime.types';
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
  getToken,
}: ActiveApplicationSurfaceProps) {
  const coordinatorState = useSyncExternalStore(
    lifecycle.store.subscribe,
    lifecycle.store.getState,
    lifecycle.store.getState,
  );
  const runtimeStore = useNotificationRuntimeStore();

  const onReply = useCallback(
    (itemId: string) => {
      const current = selectCurrentItem(runtimeStore.getState());
      if (!current) return;
      const currentId = notificationItemId(current);
      if (currentId !== itemId) return;

      let targetUserId: string | null = null;
      if (current.kind === 'incoming' || current.kind === 'check') {
        targetUserId = current.ban.sender?.id ?? null;
      } else if (current.kind === 'result') {
        const senderId = current.result.sender?.id ?? null;
        const receiverId = current.result.receiver?.id ?? null;
        targetUserId =
          user?.id && senderId === user.id ? receiverId : senderId;
      }
      if (!targetUserId) return;

      const activeReply = selectReplyCompose(lifecycle.store.getState());
      if (activeReply) return;

      const resumeToken = lifecycle.resumeTokens.create();
      lifecycle.dispatch({
        type: 'REPLY_REQUESTED',
        sourceItemId: itemId,
        targetUserId,
        resumeToken,
      });
    },
    [lifecycle, runtimeStore, user?.id],
  );

  const onStartBan = useCallback(() => {
    lifecycle.dispatch({ type: 'PRODUCT_COMPOSE_REQUESTED' });
  }, [lifecycle]);

  const onOpenBans = useCallback(() => {
    lifecycle.dispatch({
      type: 'ENTRY_ROUTED',
      intent: { type: 'PRODUCT', route: 'BANS' },
    });
  }, [lifecycle]);

  const onNotificationSurfaceUnavailable = useCallback(
    (
      input: Parameters<
        NonNullable<DirectNotificationHostProps['onSurfaceUnavailable']>
      >[0],
    ) => {
      lifecycle.dispatch({
        type: 'NOTIFICATION_SURFACE_UNAVAILABLE',
        ...input,
      });
    },
    [lifecycle],
  );

  if (coordinatorState.mode.type === 'BOOTING') {
    return <BootSurface />;
  }

  if (coordinatorState.mode.type === 'NOTIFICATION') {
    return (
      <div data-surface-owner="NOTIFICATION_SYSTEM">
        <DirectNotificationHost
          viewerId={user?.id ?? null}
          getToken={getToken}
          expectedItemId={coordinatorState.mode.itemId}
          onSurfaceUnavailable={onNotificationSurfaceUnavailable}
          onOpenBans={onOpenBans}
          onReply={onReply}
        />
      </div>
    );
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
