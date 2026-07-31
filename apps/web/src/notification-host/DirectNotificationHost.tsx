/**
 * Stage 7 Phase 1 — Direct Notification Host (passive).
 *
 * Activation policy is intentionally absent. Coordinator should not enter
 * NOTIFICATION from Runtime queue facts. If it does, render a diagnostic only.
 * No expectedItem veto / second identity authority.
 */
'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import {
  selectNotificationViewState,
  type NotificationViewState,
} from '@/notification-runtime/notification-runtime.host-api';
import { createNotificationIntents } from '@/notification-runtime/notification-runtime.intents';
import { requestDirectTransportRefresh } from '@/notification-host/NotificationRuntimeTransport';
import './direct-notification-host.css';

export type DirectNotificationHostProps = {
  viewerId: string | null;
  getToken: () => string | null;
  /** Coordinator owner item id — diagnostic only; not a veto gate. */
  coordinatorItemId?: string | null;
};

export function DirectNotificationHost({
  viewerId,
  getToken,
  coordinatorItemId = null,
}: DirectNotificationHostProps) {
  const store = useNotificationRuntimeStore();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );

  const view: NotificationViewState = useMemo(
    () => selectNotificationViewState(state),
    [state],
  );

  const intents = useMemo(
    () =>
      createNotificationIntents({
        store,
        getToken,
        onRefresh: (reason) => requestDirectTransportRefresh(reason),
      }),
    [store, getToken],
  );

  void viewerId;
  void intents;

  if (
    process.env.NODE_ENV !== 'production' &&
    coordinatorItemId &&
    view.readyHeadId &&
    coordinatorItemId !== view.readyHeadId
  ) {
    console.error(
      '[DirectNotificationHost] Coordinator/Runtime identity skew',
      { coordinatorItemId, readyHeadId: view.readyHeadId },
    );
  }

  return (
    <div
      className="direct-notification-host direct-notification-host--neutral"
      data-host="direct"
      data-phase={view.phase}
      data-ready-head-id={view.readyHeadId ?? ''}
      data-coordinator-item-id={coordinatorItemId ?? ''}
      aria-busy={
        view.phase === 'BOOTING' || view.phase === 'RECOVERING'
          ? true
          : undefined
      }
    >
      <div className="direct-notification-host__diagnostic" role="status">
        <p>Notification activation unavailable</p>
        <p className="text-muted text-sm">
          Queue ready: {view.readyHeadId ?? 'none'} · pending{' '}
          {view.pendingCount}
        </p>
      </div>
    </div>
  );
}
