'use client';

import { useEffect, useSyncExternalStore, Children, isValidElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NOTIFICATION_BACKDROP_Z_INDEX } from '@/lib/overlay-queue';

type ActiveOverlayKind = 'incoming' | 'check' | 'result';

interface Props {
  /** When true, the layer accepts pointer events (backdrop taps). */
  active: boolean;
  children: ReactNode;
  /** Keeps session backdrop visible between queued cards. */
  queueSessionActive?: boolean;
  /** Check card mounted — force pointer-events on notification host. */
  checkInteractive?: boolean;
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
  queueSessionActive = false,
  checkInteractive = false,
  activeOverlayKind = null,
  activeIncomingBanId = null,
}: Props) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    console.log('[global-overlay-host-render]', {
      active,
      pointerActive: active,
      backdropActive: queueSessionActive,
      checkInteractive,
      activeKind: activeOverlayKind,
    });
  }, [active, queueSessionActive, checkInteractive, activeOverlayKind]);

  useEffect(() => {
    if (!activeOverlayKind) return;
    console.log('[OVERLAY ACTIVE LOCK]', {
      hostKind: activeOverlayKind,
      incomingBanId: activeIncomingBanId,
    });
  }, [activeOverlayKind, activeIncomingBanId]);

  if (!mounted || typeof document === 'undefined') return null;

  const hasOverlay = Children.toArray(children).some(
    (child) => child != null && child !== false && isValidElement(child),
  );
  console.log('ACTUAL_COMPONENT_RENDER: NotificationOverlayShell', {
    t: performance.now(),
    kind: activeOverlayKind,
    activeKind: activeOverlayKind,
    hasOverlay,
    visible: active,
    queueLen: null,
    pendingLen: null,
  });

  return createPortal(
    <div
      className={`app-notification-layer${active ? ' app-notification-layer--active' : ''}${
        queueSessionActive ? ' app-notification-layer--session' : ''
      }${checkInteractive ? ' app-notification-layer--check-interactive' : ''}`}
      style={{ zIndex: APP_NOTIFICATION_BACKDROP_Z_INDEX }}
      data-notification-layer=""
      aria-hidden={!active}
    >
      {active ? (
        <div className="app-notification-layer__hit-blocker" aria-hidden />
      ) : null}
      {queueSessionActive ? (
        <div className="app-notification-layer__session-backdrop" aria-hidden />
      ) : null}
      <div
        className={`app-notification-layer__content${
          queueSessionActive ? ' app-notification-layer__content--card-host' : ''
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
