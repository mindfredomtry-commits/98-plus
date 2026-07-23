/**
 * Vertical 1 — production provider for queue + atomic advance authority.
 * Does not mount effects / pending indicator / check submit / drain / recovery.
 */
'use client';

import { useMemo, type ReactNode } from 'react';
import { NotificationRuntimeContext } from './notification-runtime.context';
import { createNotificationRuntimeStore } from './notification-runtime.store';

export function NotificationRuntimeProvider({
  children,
  store: storeProp,
}: {
  children: ReactNode;
  /** Optional inject for tests. */
  store?: ReturnType<typeof createNotificationRuntimeStore>;
}) {
  const store = useMemo(
    () => storeProp ?? createNotificationRuntimeStore(),
    [storeProp],
  );
  return (
    <NotificationRuntimeContext.Provider value={store}>
      {children}
    </NotificationRuntimeContext.Provider>
  );
}
