/**
 * Phase 0 Direct Notification Host.
 *
 * Subscribe → selectors → render → intents.
 * No own queue, timers of ownership, mirrors, or legacy refs.
 */
'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DirectCheckCard } from '@/components/notification/DirectCheckCard';
import { DirectIncomingCard } from '@/components/notification/DirectIncomingCard';
import { DirectLobbySurface } from '@/components/notification/DirectLobbySurface';
import { DirectResultCard } from '@/components/notification/DirectResultCard';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import {
  selectNotificationViewState,
  type NotificationViewState,
} from '@/notification-runtime/notification-runtime.host-api';
import { createNotificationIntents } from '@/notification-runtime/notification-runtime.intents';
import { requestDirectTransportRefresh } from '@/notification-host/NotificationRuntimeTransport';
import './direct-notification-host.css';

export type DirectNotificationHostProps = {
  viewerId: string | null;
  getToken: () => string | null;
  lobbyBootIntroPrimed?: boolean;
  hostBlocksCta?: boolean;
  influencePercent?: number;
  onStartBan?: () => void;
  onReply?: (itemId: string) => void;
  onOpenBans?: (itemId: string | null) => void;
};

export function DirectNotificationHost({
  viewerId,
  getToken,
  lobbyBootIntroPrimed = true,
  hostBlocksCta = false,
  influencePercent = 0,
  onStartBan,
  onReply,
  onOpenBans,
}: DirectNotificationHostProps) {
  const store = useNotificationRuntimeStore();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );

  const view: NotificationViewState = useMemo(
    () =>
      selectNotificationViewState(state, {
        lobbyBootIntroPrimed,
        hostBlocksCta,
      }),
    [state, lobbyBootIntroPrimed, hostBlocksCta],
  );

  const intents = useMemo(
    () =>
      createNotificationIntents({
        store,
        getToken,
        onRefresh: (reason) => requestDirectTransportRefresh(reason),
        onReply,
        onOpenBans,
      }),
    [store, getToken, onReply, onOpenBans],
  );

  const overlay =
    view.phase === 'INCOMING' && view.currentCard?.kind === 'incoming' ? (
      <div className="direct-notification-host__overlay" data-phase="INCOMING">
        <DirectIncomingCard
          ban={view.currentCard.ban}
          disabled={view.isProcessingAction}
          onAccept={() => {
            void intents.accept();
          }}
          onReply={() => {
            intents.reply();
          }}
        />
      </div>
    ) : view.phase === 'CHECK' && view.currentCard?.kind === 'check' ? (
      <div className="direct-notification-host__overlay" data-phase="CHECK">
        <DirectCheckCard
          ban={view.currentCard.ban}
          viewerId={viewerId}
          disabled={view.isProcessingAction}
          onConfirm={(completed) => {
            void intents.confirmCheck(completed);
          }}
        />
      </div>
    ) : view.phase === 'RESULT' && view.currentCard?.kind === 'result' ? (
      <div className="direct-notification-host__overlay" data-phase="RESULT">
        <DirectResultCard
          result={view.currentCard.result}
          disabled={view.isProcessingAction}
          onGoToBans={() => {
            void intents.dismissResult('go_to_bans');
          }}
          onDismiss={() => {
            void intents.dismissResult('close_result');
          }}
          onReply={() => {
            intents.reply();
          }}
        />
      </div>
    ) : null;

  const lobby =
    view.phase === 'LOBBY' ||
    view.phase === 'BOOTING' ||
    view.phase === 'RECOVERING' ? (
      <DirectLobbySurface
        ctaVisible={view.ctaVisible}
        indicatorVisible={view.indicatorVisible}
        pendingCount={view.pendingCount}
        influencePercent={influencePercent}
        onStartBan={() => {
          onStartBan?.();
          intents.openBansCta();
        }}
      />
    ) : null;

  if (typeof document === 'undefined') {
    return (
      <div className="direct-notification-host" data-host="direct">
        {lobby}
      </div>
    );
  }

  return (
    <div className="direct-notification-host" data-host="direct">
      {lobby}
      {overlay
        ? createPortal(overlay, document.body)
        : null}
    </div>
  );
}
