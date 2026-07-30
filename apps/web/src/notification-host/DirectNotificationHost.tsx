/**
 * Phase 0 Direct Notification Host.
 *
 * Subscribe → selectors → render → intents.
 * No own queue, timers of ownership, mirrors, or legacy refs.
 */
'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { DirectCheckCard } from '@/components/notification/DirectCheckCard';
import { DirectIncomingCard } from '@/components/notification/DirectIncomingCard';
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
  expectedItemId: string;
  onSurfaceUnavailable?: (input: {
    expectedItemId: string;
    runtimeItemId: string | null;
    runtimePhase: NotificationViewState['phase'];
  }) => void;
  onReply?: (itemId: string) => void;
  onOpenBans?: (itemId: string | null) => void;
};

export function DirectNotificationHost({
  viewerId,
  getToken,
  expectedItemId,
  onSurfaceUnavailable,
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
    () => selectNotificationViewState(state),
    [state],
  );
  const unavailableSignatureRef = useRef<string | null>(null);
  const runtimeItemId = view.currentCard?.itemId ?? null;
  const expectedItemIsDisplayable =
    runtimeItemId === expectedItemId &&
    ((view.phase === 'INCOMING' && view.currentCard?.kind === 'incoming') ||
      (view.phase === 'CHECK' && view.currentCard?.kind === 'check') ||
      (view.phase === 'RESULT' && view.currentCard?.kind === 'result'));

  useEffect(() => {
    if (expectedItemIsDisplayable) {
      unavailableSignatureRef.current = null;
      return;
    }
    const signature = `${expectedItemId}|${runtimeItemId ?? 'none'}|${view.phase}`;
    if (unavailableSignatureRef.current === signature) return;
    unavailableSignatureRef.current = signature;
    onSurfaceUnavailable?.({
      expectedItemId,
      runtimeItemId,
      runtimePhase: view.phase,
    });
  }, [
    expectedItemId,
    expectedItemIsDisplayable,
    onSurfaceUnavailable,
    runtimeItemId,
    view.phase,
  ]);

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
    expectedItemIsDisplayable &&
    view.phase === 'INCOMING' &&
    view.currentCard?.kind === 'incoming' ? (
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
    ) : expectedItemIsDisplayable &&
      view.phase === 'CHECK' &&
      view.currentCard?.kind === 'check' ? (
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
    ) : expectedItemIsDisplayable &&
      view.phase === 'RESULT' &&
      view.currentCard?.kind === 'result' ? (
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

  if (!overlay) {
    return (
      <div
        className="direct-notification-host direct-notification-host--neutral"
        data-host="direct"
        data-phase="NEUTRAL"
        data-runtime-phase={view.phase}
        data-expected-item-id={expectedItemId}
        aria-busy={
          view.phase === 'BOOTING' || view.phase === 'RECOVERING'
            ? true
            : undefined
        }
      >
        <span className="sr-only">
          {view.phase === 'RECOVERING'
            ? 'Восстановление уведомления'
            : 'Загрузка уведомления'}
        </span>
      </div>
    );
  }

  if (typeof document === 'undefined') {
    return (
      <div className="direct-notification-host" data-host="direct" />
    );
  }

  return (
    <div className="direct-notification-host" data-host="direct">
      {createPortal(overlay, document.body)}
    </div>
  );
}
