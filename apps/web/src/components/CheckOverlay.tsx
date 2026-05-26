'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { SYSTEM_VOICE, formatSenderDisplayName } from '@98plus/shared';
import type { BanInteraction, BanResult } from '@98plus/shared';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { BanTimer } from './BanTimer';
import { challengeLog } from '@/lib/challenge-log';
import { ModalShell } from './ModalShell';

function CheckOverlayInner() {
  const {
    token,
    checkBan,
    checkWaiting,
    setCheckWaiting,
    openBanResult,
    refreshUser,
    clearCheckOverlay,
  } = useApp();
  const { haptic } = useTelegram();
  const [submitting, setSubmitting] = useState(false);

  const open =
    !!checkBan?.id && !!token && checkBan.status === 'checking';

  const sender = checkBan?.sender;
  const senderLabel = useMemo(
    () =>
      sender
        ? formatSenderDisplayName(sender.username, sender.firstName)
        : '',
    [sender],
  );

  const answer = useCallback(
    async (completed: boolean) => {
      if (!checkBan?.id || !token || submitting) return;
      haptic('light');
      setSubmitting(true);
      try {
        const res = await api<{
          done: boolean;
          waiting?: boolean;
          result?: BanResult;
        }>(`/bans/${checkBan.id}/check`, {
          method: 'POST',
          token,
          body: JSON.stringify({ completed }),
        });

        if (res.done && res.result) {
          challengeLog('check:done', { banId: checkBan.id });
          clearCheckOverlay();
          openBanResult(res.result, 'live');
          void refreshUser();
        } else if (res.waiting) {
          challengeLog('check:waiting-ui', { banId: checkBan.id });
          setCheckWaiting(true);
          window.setTimeout(() => {
            clearCheckOverlay();
          }, 3000);
        }
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      checkBan?.id,
      clearCheckOverlay,
      haptic,
      refreshUser,
      setCheckWaiting,
      openBanResult,
      submitting,
      token,
    ],
  );

  if (!open || !checkBan) {
    return null;
  }

  return (
    <ModalShell
      open
      light
      closeOnBackdrop={false}
      ariaLabel="Проверка запрета"
      onClose={clearCheckOverlay}
      cardClassName="modal-card--check"
    >
      {checkWaiting ? (
        <div className="check-modal-body text-center py-2">
          <p className="text-accent font-semibold mb-1">⚡ Ждём друга</p>
          <p className="text-muted text-sm">Ответ учтён. Скоро результат.</p>
        </div>
      ) : (
        <div className="check-modal-body text-center">
          <div className="check-modal-head mb-3">
            <p className="check-modal-title text-xl font-black text-glow">
              {SYSTEM_VOICE.checkPrompt}
            </p>
            {checkBan.remainingMs != null ? (
              <div className="check-modal-timer">
                <BanTimer remainingMs={checkBan.remainingMs} />
              </div>
            ) : null}
          </div>

          {sender ? (
            <div className="check-modal-sender mb-3">
              <SenderAvatar user={sender} />
              <p className="text-muted text-xs mt-2">{senderLabel}</p>
            </div>
          ) : null}

          <p className="check-modal-text text-base font-semibold leading-snug mb-4">
            «{checkBan.text}»
          </p>

          <div className="check-modal-actions space-y-2.5">
            <BigButton
              className="check-answer-btn"
              disabled={submitting}
              aria-label="Выполнил"
              onClick={() => answer(true)}
            >
              ✅
            </BigButton>
            <BigButton
              variant="ghost"
              className="check-answer-btn"
              disabled={submitting}
              aria-label="Не выполнил"
              onClick={() => answer(false)}
            >
              ❌
            </BigButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

export const CheckOverlay = memo(CheckOverlayInner);

function SenderAvatar({
  user,
}: {
  user: NonNullable<BanInteraction['sender']>;
}) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar mx-auto" aria-hidden>
      {user.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg font-bold">{letter}</span>
      )}
    </div>
  );
}
