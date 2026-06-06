'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NOTIFICATION_Z_INDEX } from '@/lib/overlay-queue';

type ActiveOverlayKind = 'incoming' | 'check' | 'result';

interface Props {
  /** When true, the layer accepts pointer events (backdrop taps). */
  active: boolean;
  children: ReactNode;
  /** Only one notification overlay kind is mounted at a time. */
  activeOverlayKind?: ActiveOverlayKind | null;
  activeIncomingBanId?: string | null;
}

/**
 * Top-most notification shell — incoming / check / result overlays render here
 * so they always stack above instant-ban flow, lobby, and success morph.
 */
export function GlobalOverlayHost({
  active,
  children,
  activeOverlayKind = null,
  activeIncomingBanId = null,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeOverlayKind) return;
    console.log('[OVERLAY ACTIVE LOCK]', {
      hostKind: activeOverlayKind,
      incomingBanId: activeIncomingBanId,
    });
  }, [activeOverlayKind, activeIncomingBanId]);

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
