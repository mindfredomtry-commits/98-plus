'use client';

import type { ReactNode } from 'react';
import type { MaterializedNotificationDisplay } from '@/notification-runtime/notification-runtime.presentation';

/**
 * Exclusive notification root. Requires a materialized display — refuses to
 * mount an empty card shell.
 */
export function NotificationSurface({
  display,
  children,
}: {
  display: MaterializedNotificationDisplay;
  children?: ReactNode;
}) {
  if (!display || !display.kind) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      throw new Error(
        '[PRESENTATION_INVARIANT] NotificationSurface requires materialized display',
      );
    }
    return null;
  }
  return (
    <div
      data-presentation-surface="notification"
      data-presentation-display-kind={display.kind}
      data-testid="presentation-notification"
    >
      {children}
    </div>
  );
}
