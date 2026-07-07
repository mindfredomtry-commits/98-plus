'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  Children,
  isValidElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  APP_NOTIFICATION_BACKDROP_Z_INDEX,
  APP_NOTIFICATION_VISUAL_SHIELD_Z_INDEX,
} from '@/lib/overlay-queue';
import { logOverlayBackdropLayerTrace } from '@/lib/overlay-backdrop-layer-trace-debug';

type ActiveOverlayKind = 'incoming' | 'check' | 'result';

interface Props {
  /** When true, the layer accepts pointer events (backdrop taps). */
  active: boolean;
  children: ReactNode;
  /** Keeps session backdrop visible between queued cards. */
  queueSessionActive?: boolean;
  /** Visual queue dim session — keeps backdrop painted without remount flicker. */
  visualShieldBackdrop?: boolean;
  /** Trace context for OVERLAY_BACKDROP_LAYER_TRACE. */
  backdropTraceContext?: {
    visualQueueDimSessionLive: boolean;
    cardContentMounted: boolean;
    hostMounted: boolean;
    decisionReason: string;
  };
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
  visualShieldBackdrop = false,
  backdropTraceContext,
  checkInteractive = false,
  activeOverlayKind = null,
  activeIncomingBanId = null,
}: Props) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const backdropTraceSigRef = useRef('');

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const sessionBackdropVisible = visualShieldBackdrop || queueSessionActive;
  const hostZIndex = visualShieldBackdrop
    ? APP_NOTIFICATION_VISUAL_SHIELD_Z_INDEX
    : APP_NOTIFICATION_BACKDROP_Z_INDEX;

  useEffect(() => {
    console.log('[global-overlay-host-render]', {
      active,
      pointerActive: active,
      backdropActive: sessionBackdropVisible,
      visualShieldBackdrop,
      checkInteractive,
      activeKind: activeOverlayKind,
    });
  }, [
    active,
    sessionBackdropVisible,
    visualShieldBackdrop,
    checkInteractive,
    activeOverlayKind,
  ]);

  useEffect(() => {
    if (!activeOverlayKind) return;
    console.log('[OVERLAY ACTIVE LOCK]', {
      hostKind: activeOverlayKind,
      incomingBanId: activeIncomingBanId,
    });
  }, [activeOverlayKind, activeIncomingBanId]);

  useLayoutEffect(() => {
    if (!backdropTraceContext) return;
    const backdropEl = backdropRef.current;
    const backdropStyle = backdropEl
      ? window.getComputedStyle(backdropEl)
      : null;
    const backdropRendered =
      backdropEl != null &&
      sessionBackdropVisible &&
      backdropStyle?.display !== 'none' &&
      backdropStyle?.visibility !== 'hidden' &&
      backdropStyle?.opacity !== '0';
    const trace = {
      visualQueueDimSessionLive: backdropTraceContext.visualQueueDimSessionLive,
      backdropRendered,
      backdropClassName: backdropEl?.className ?? null,
      hostMounted: backdropTraceContext.hostMounted,
      cardContentMounted: backdropTraceContext.cardContentMounted,
      zIndex: backdropStyle?.zIndex ?? null,
      pointerEvents: backdropStyle?.pointerEvents ?? null,
      opacity: backdropStyle?.opacity ?? null,
      decisionReason: backdropRendered
        ? sessionBackdropVisible && !backdropTraceContext.cardContentMounted
          ? 'visual-shield-backdrop-painted-during-card-gap'
          : backdropTraceContext.decisionReason
        : sessionBackdropVisible
          ? 'BROKEN_BACKDROP_NOT_PAINTED'
          : 'backdrop-released',
    };
    const sig = [
      trace.decisionReason,
      trace.visualQueueDimSessionLive,
      trace.backdropRendered,
      trace.backdropClassName,
      trace.hostMounted,
      trace.cardContentMounted,
      trace.zIndex,
      trace.pointerEvents,
      trace.opacity,
    ].join('|');
    if (sig === backdropTraceSigRef.current) return;
    backdropTraceSigRef.current = sig;
    logOverlayBackdropLayerTrace(trace);
  }, [
    backdropTraceContext,
    sessionBackdropVisible,
    visualShieldBackdrop,
    queueSessionActive,
  ]);

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
        sessionBackdropVisible ? ' app-notification-layer--session' : ''
      }${visualShieldBackdrop ? ' app-notification-layer--visual-shield' : ''}${
        checkInteractive ? ' app-notification-layer--check-interactive' : ''
      }`}
      style={{ zIndex: hostZIndex }}
      data-notification-layer=""
      aria-hidden={!active && !sessionBackdropVisible}
    >
      {active ? (
        <div className="app-notification-layer__hit-blocker" aria-hidden />
      ) : null}
      <div
        ref={backdropRef}
        className={`app-notification-layer__session-backdrop${
          sessionBackdropVisible
            ? ' app-notification-layer__session-backdrop--visible'
            : ''
        }${visualShieldBackdrop ? ' app-notification-layer__session-backdrop--visual-shield' : ''}`}
        aria-hidden={!sessionBackdropVisible}
      />
      <div
        className={`app-notification-layer__content${
          sessionBackdropVisible ? ' app-notification-layer__content--card-host' : ''
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
