'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NOTIFICATION_Z_INDEX } from '@/lib/overlay-queue';

interface Props {
  /** When true, the layer accepts pointer events (backdrop taps). */
  active: boolean;
  children: ReactNode;
}

/**
 * Top-most notification shell — incoming / check / result overlays render here
 * so they always stack above instant-ban flow, lobby, and success morph.
 */
export function GlobalOverlayHost({ active, children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`app-notification-layer${active ? ' app-notification-layer--active' : ''}`}
      style={{ zIndex: APP_NOTIFICATION_Z_INDEX }}
      data-notification-layer=""
      aria-hidden={!active}
    >
      {children}
    </div>,
    document.body,
  );
}
