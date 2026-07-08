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
import { logOverlayBackdropDomStyleTrace } from '@/lib/overlay-backdrop-dom-style-trace-debug';

type ActiveOverlayKind = 'incoming' | 'check' | 'result';

interface Props {
  /** When true, the layer accepts pointer events (backdrop taps). */
  active: boolean;
  children: ReactNode;
  /** Keeps session backdrop visible between queued cards. */
  queueSessionActive?: boolean;
  /** Visual queue dim session — keeps backdrop painted without remount flicker. */
  visualShieldBackdrop?: boolean;
  /** Backdrop paint — card mounted OR visual queue session with queue head. */
  backdropPaintActive?: boolean;
  /** Trace context for backdrop diagnostics. */
  backdropTraceContext?: {
    visualQueueDimSessionLive: boolean;
    cardContentMounted: boolean;
    hostMounted: boolean;
    globalOverlayHostActive: boolean;
    queueHeadKind: string | null;
    activeKind: string | null;
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
  backdropPaintActive = false,
  backdropTraceContext,
  checkInteractive = false,
  activeOverlayKind = null,
  activeIncomingBanId = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const backdropTraceSigRef = useRef('');
  const domStyleTraceSigRef = useRef('');

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const sessionBackdropVisible =
    backdropPaintActive || visualShieldBackdrop || queueSessionActive;
  const gapBackdropHold =
    sessionBackdropVisible &&
    backdropTraceContext != null &&
    !backdropTraceContext.cardContentMounted &&
    backdropTraceContext.visualQueueDimSessionLive;
  const hostZIndexValue = sessionBackdropVisible
    ? APP_NOTIFICATION_VISUAL_SHIELD_Z_INDEX
    : APP_NOTIFICATION_BACKDROP_Z_INDEX;

  useEffect(() => {
    console.log('[global-overlay-host-render]', {
      active,
      pointerActive: active,
      backdropActive: sessionBackdropVisible,
      backdropPaintActive,
      visualShieldBackdrop,
      checkInteractive,
      activeKind: activeOverlayKind,
    });
  }, [
    active,
    backdropPaintActive,
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
    backdropPaintActive,
  ]);

  useLayoutEffect(() => {
    if (!backdropTraceContext) return;
    const backdropEl = backdropRef.current;
    const hostEl = hostRef.current;
    const backdropStyle = backdropEl
      ? window.getComputedStyle(backdropEl)
      : null;
    const hostStyle = hostEl ? window.getComputedStyle(hostEl) : null;
    const lobbyEl = document.querySelector('.instant-ban-flow');
    const lobbyStyle = lobbyEl ? window.getComputedStyle(lobbyEl) : null;
    const computedOpacity = backdropStyle?.opacity ?? null;
    const backdropActive =
      sessionBackdropVisible &&
      backdropEl != null &&
      backdropStyle?.display !== 'none' &&
      backdropStyle?.visibility !== 'hidden' &&
      computedOpacity != null &&
      computedOpacity !== '0';
    const isGapFrame =
      !backdropTraceContext.cardContentMounted &&
      backdropTraceContext.visualQueueDimSessionLive;
    let reason = 'backdrop-style-idle';
    if (isGapFrame && backdropActive) {
      reason = 'visual-queue-gap-backdrop-style-active';
    } else if (isGapFrame && sessionBackdropVisible && !backdropActive) {
      reason = 'BROKEN_GAP_BACKDROP_STYLE_INACTIVE';
    } else if (backdropActive) {
      reason = 'backdrop-style-active';
    } else if (sessionBackdropVisible) {
      reason = 'BROKEN_BACKDROP_STYLE_NOT_PAINTED';
    }

    const domTrace = {
      globalOverlayHostActive: backdropTraceContext.globalOverlayHostActive,
      backdropMounted: backdropEl != null,
      backdropActive,
      backdropClassName: backdropEl?.className ?? null,
      backdropStyleOpacity: backdropEl?.style.opacity || null,
      backdropComputedOpacity: computedOpacity,
      backdropZIndex: backdropStyle?.zIndex ?? null,
      hostZIndex: hostStyle?.zIndex ?? null,
      lobbyZIndex: lobbyStyle?.zIndex ?? null,
      cardMounted: backdropTraceContext.cardContentMounted,
      visualQueueDimSessionLive: backdropTraceContext.visualQueueDimSessionLive,
      queueHeadKind: backdropTraceContext.queueHeadKind,
      activeKind: backdropTraceContext.activeKind,
      reason,
    };
    const sig = [
      domTrace.reason,
      domTrace.backdropActive,
      domTrace.backdropClassName,
      domTrace.backdropComputedOpacity,
      domTrace.backdropZIndex,
      domTrace.hostZIndex,
      domTrace.cardMounted,
      domTrace.queueHeadKind,
    ].join('|');
    if (sig === domStyleTraceSigRef.current) return;
    domStyleTraceSigRef.current = sig;
    logOverlayBackdropDomStyleTrace(domTrace);
  }, [
    backdropPaintActive,
    backdropTraceContext,
    queueSessionActive,
    sessionBackdropVisible,
    visualShieldBackdrop,
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
      ref={hostRef}
      className={`app-notification-layer${active ? ' app-notification-layer--active' : ''}${
        sessionBackdropVisible ? ' app-notification-layer--session' : ''
      }${sessionBackdropVisible ? ' app-notification-layer--visual-shield' : ''}${
        checkInteractive ? ' app-notification-layer--check-interactive' : ''
      }`}
      style={{ zIndex: hostZIndexValue }}
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
        }${
          sessionBackdropVisible
            ? ' app-notification-layer__session-backdrop--visual-shield'
            : ''
        }${gapBackdropHold ? ' app-notification-layer__session-backdrop--gap-hold' : ''}`}
        style={
          sessionBackdropVisible
            ? {
                opacity: 1,
                visibility: 'visible',
                zIndex: 140,
              }
            : undefined
        }
        aria-hidden={!sessionBackdropVisible}
      />
      <div
        className={`app-notification-layer__content${
          sessionBackdropVisible && hasOverlay
            ? ' app-notification-layer__content--card-host'
            : ''
        }${gapBackdropHold ? ' app-notification-layer__content--gap-hold' : ''}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
