'use client';

import { useLayoutEffect, useRef } from 'react';
import { SYSTEM_VOICE } from '@98plus/shared';
import { useApp } from '@/components/Providers';
import type { ConnectionUiState } from '@/lib/connection-ui';
import {
  getQueueDisplayDiagSnapshot,
  logNoConnectionFallbackRendered,
} from '@/lib/active-hold-diag-debug';
import { shouldSuppressFullConnectionFallback } from '@/lib/connection-state-debug';

export function ConnectionBanner({
  state,
  onRetry,
}: {
  state: ConnectionUiState;
  onRetry?: () => void;
}) {
  const { lobbyOpen, connectionUiState } = useApp();
  const lastRenderLogKeyRef = useRef<string | null>(null);

  const snap = getQueueDisplayDiagSnapshot();
  const suppressed = shouldSuppressFullConnectionFallback({
    activeKind: snap.activeKind,
    hasVisibleUserCardOverlay: snap.hasVisibleUserCardOverlay,
    overlayQueueLen: snap.overlayQueueLen,
    pendingLen: snap.pendingLen,
  });

  useLayoutEffect(() => {
    if (state !== 'offline') {
      lastRenderLogKeyRef.current = null;
      return;
    }

    const logKey = [
      state,
      snap.activeKind,
      snap.activeBanId,
      snap.overlayQueueLen,
      snap.pendingLen,
      snap.hasVisibleUserCardOverlay,
      suppressed,
    ].join('|');
    if (lastRenderLogKeyRef.current === logKey) return;
    lastRenderLogKeyRef.current = logKey;

    logNoConnectionFallbackRendered({
      reason: suppressed
        ? 'connection-ui-offline-suppressed-for-visible-queue-card'
        : 'connection-ui-offline',
      currentRoute:
        typeof window !== 'undefined' ? window.location.pathname : null,
      lobbyOpen,
      bootVisible: snap.bootVisible,
      activeKind: snap.activeKind,
      activeBanId: snap.activeBanId,
      notificationQueueLen: snap.overlayQueueLen,
      overlayQueueLen: snap.overlayQueueLen,
      pendingLen: snap.pendingLen,
      hasNotificationShell: snap.hasNotificationShell,
      hasIncomingShell: snap.hasIncomingShell,
      hasResultShell: snap.hasResultShell,
      hasVisibleUserCardOverlay: snap.hasVisibleUserCardOverlay,
      errorFallbackVisible: true,
      connectionUiState,
      offlineMessage: SYSTEM_VOICE.offline,
      suppressed,
    });
  }, [
    connectionUiState,
    lobbyOpen,
    snap.activeBanId,
    snap.activeKind,
    snap.bootVisible,
    snap.hasIncomingShell,
    snap.hasNotificationShell,
    snap.hasResultShell,
    snap.hasVisibleUserCardOverlay,
    snap.overlayQueueLen,
    snap.pendingLen,
    state,
    suppressed,
  ]);

  if (state === 'hidden') return null;

  if (suppressed) {
    return (
      <div
        className="fixed bottom-3 right-3 z-[81] pointer-events-none"
        aria-hidden
        title={SYSTEM_VOICE.offline}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-warning/80 shadow-[0_0_8px_rgba(255,180,0,0.45)]" />
      </div>
    );
  }

  return (
    <div
      className="connection-banner fixed top-0 left-0 right-0 z-[80] px-4 py-2 text-center text-sm pointer-events-none bg-warning/25 text-warning"
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
      {SYSTEM_VOICE.offline}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-2 underline font-medium pointer-events-auto"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}
