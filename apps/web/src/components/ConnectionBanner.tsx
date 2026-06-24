'use client';

import { useEffect } from 'react';
import { SYSTEM_VOICE } from '@98plus/shared';
import { useApp } from '@/components/Providers';
import type { ConnectionUiState } from '@/lib/connection-ui';
import {
  getQueueDisplayDiagSnapshot,
  logNoConnectionFallbackRendered,
} from '@/lib/active-hold-diag-debug';

export function ConnectionBanner({
  state,
  onRetry,
}: {
  state: ConnectionUiState;
  onRetry?: () => void;
}) {
  const {
    lobbyOpen,
    connectionUiState,
  } = useApp();

  useEffect(() => {
    if (state !== 'offline') return;
    const snap = getQueueDisplayDiagSnapshot();
    logNoConnectionFallbackRendered({
      reason: 'connection-ui-offline',
      currentRoute:
        typeof window !== 'undefined' ? window.location.pathname : null,
      lobbyOpen,
      bootVisible: snap.bootVisible,
      activeKind: null,
      activeBanId: snap.currentIncomingBanId,
      notificationQueueLen: snap.overlayQueueLen,
      overlayQueueLen: snap.overlayQueueLen,
      pendingLen: snap.pendingLen,
      hasNotificationShell: snap.hasNotificationShell,
      hasIncomingShell: snap.hasIncomingShell,
      hasResultShell: snap.hasResultShell,
      errorFallbackVisible: true,
      connectionUiState,
      offlineMessage: SYSTEM_VOICE.offline,
    });
  }, [connectionUiState, lobbyOpen, state]);

  if (state === 'hidden') return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[80] px-4 py-2 text-center text-sm pointer-events-none bg-warning/25 text-warning"
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
