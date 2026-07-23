/**
 * Vertical 1 — React context for notification runtime store.
 * Minimal: no effects layer / pending / deeplink / recovery.
 */
import { createContext, useContext } from 'react';
import type { NotificationRuntimeStore } from './notification-runtime.store';

export const NotificationRuntimeContext =
  createContext<NotificationRuntimeStore | null>(null);

export function useNotificationRuntimeStore(): NotificationRuntimeStore {
  const store = useContext(NotificationRuntimeContext);
  if (!store) {
    throw new Error(
      'useNotificationRuntimeStore requires NotificationRuntimeProvider',
    );
  }
  return store;
}

/** Optional read — TEMP until all consumers migrate. */
export function useNotificationRuntimeStoreOptional(): NotificationRuntimeStore | null {
  return useContext(NotificationRuntimeContext);
}
