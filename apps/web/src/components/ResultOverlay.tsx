'use client';

import { memo, useCallback, useEffect, useMemo } from 'react';
import type { BanResult } from '@98plus/shared';
import { isValidBanResultPayload, isResultParticipant } from '@98plus/shared';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import { shareDeepLink } from '@/lib/share';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { ModalShell } from './ModalShell';

interface Props {
  result: BanResult;
  onClose: () => void;
}

function ResultOverlayInner({ result, onClose }: Props) {
  const { openSendTo, token } = useApp();
  const { haptic } = useTelegram();

  const showable =
    isValidBanResultPayload(result) &&
    isResultParticipant(result, result.viewerId);

  useEffect(() => {
    if (!showable) onClose();
  }, [showable, onClose]);

  const view = useMemo(() => {
    const isSender = result.viewerId === result.sender.id;
    const isReceiver = result.viewerId === result.receiver.id;
    const myDelta = isSender
      ? result.energy.sender
      : isReceiver
        ? result.energy.receiver
        : null;
    const primaryLabel = isReceiver
      ? '🚫 Запретить в ответ'
      : '🚫 Запретить ещё!';
    const showStatuses =
      result.confirmations !== null &&
      (result.outcome === 'both_yes' ||
        result.outcome === 'both_no' ||
        result.outcome === 'split');

    return { isSender, isReceiver, myDelta, primaryLabel, showStatuses };
  }, [result]);

  const share = useCallback(() => {
    haptic('light');
    shareDeepLink(
      { type: 'result', banId: result.id },
      `${result.headline}\n«${result.text}»\n\n98+`,
    );
    if (token) {
      api('/analytics/track', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: ANALYTICS_EVENTS.RESULT_SHARED,
          meta: { banId: result.id },
        }),
      }).catch(() => {});
    }
  }, [haptic, result.headline, result.id, result.text, token]);

  const counter = useCallback(() => {
    haptic('medium');
    const u = result.opponent?.username;
    openSendTo(u ? `@${u}` : (result.opponent?.firstName ?? ''));
    onClose();
  }, [haptic, onClose, openSendTo, result.opponent]);

  const senderStatus = result.confirmations?.sender;
  const receiverStatus = result.confirmations?.receiver;

  if (!showable) return null;

  return (
    <ModalShell open light ariaLabel="Результат проверки" onClose={onClose}>
      <div className="modal-card-body text-center">
        <p className="result-headline text-2xl font-black text-glow mb-1">
          {result.headline}
        </p>
        {result.subline ? (
          <p className="text-muted text-sm mb-4 leading-snug px-1">
            {result.subline}
          </p>
        ) : (
          <div className="mb-4" />
        )}

        <div className="result-compare mx-auto mb-4">
          <div className="result-party">
            <Avatar user={result.sender} />
            {view.showStatuses ? (
              <span className="result-status" aria-hidden>
                {senderStatus ? '✅' : '❌'}
              </span>
            ) : null}
          </div>
          <span className="result-arrow text-accent" aria-hidden>
            →
          </span>
          <div className="result-party">
            <Avatar user={result.receiver} />
            {view.showStatuses ? (
              <span className="result-status" aria-hidden>
                {receiverStatus ? '✅' : '❌'}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-base font-semibold leading-snug mb-3 px-1">
          «{result.text}»
        </p>

        {view.myDelta !== null && view.myDelta !== undefined ? (
          <p
            className={`result-energy text-2xl font-bold mb-1 ${
              view.myDelta < 0 ? 'text-warning' : 'text-accent'
            }`}
          >
            {view.myDelta > 0 ? '+' : ''}
            {view.myDelta} ⚡
          </p>
        ) : null}
        {result.farmSkipped ? (
          <p className="text-xs text-muted mb-2">Лимит фарма на сегодня</p>
        ) : null}
      </div>

      {(view.isSender || view.isReceiver) && (
        <div className="modal-card-actions space-y-3">
          <BigButton onClick={counter}>{view.primaryLabel}</BigButton>
          <BigButton variant="ghost" onClick={share}>
            Поделиться
          </BigButton>
        </div>
      )}
    </ModalShell>
  );
}

export const ResultOverlay = memo(ResultOverlayInner);

function Avatar({
  user,
}: {
  user: { firstName?: string | null; photoUrl?: string | null };
}) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar" aria-hidden>
      {user.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg font-bold">{letter}</span>
      )}
    </div>
  );
}
