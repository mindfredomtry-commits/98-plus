'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { formatSenderDisplayName, getCheckModalView } from '@98plus/shared';
import type { BanInteraction, BanResult, UserPublic } from '@98plus/shared';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { BanTimer } from './BanTimer';
import { challengeLog } from '@/lib/challenge-log';
import { ModalShell } from './ModalShell';
import { AvatarImage } from './AvatarImage';
import { userAvatarSrc } from '@/lib/user-public-avatar';

function CheckOverlayInner() {
  const {
    token,
    user,
    checkBan,
    checkWaiting,
    setCheckWaiting,
    openBanResult,
    refreshUser,
    clearCheckOverlay,
  } = useApp();
  const { haptic } = useTelegram();
  const [submitting, setSubmitting] = useState(false);

  const modalView = useMemo(() => {
    if (!checkBan) return null;
    return getCheckModalView(checkBan, user?.id ?? null);
  }, [checkBan, user?.id]);

  const open =
    !!checkBan?.id &&
    !!token &&
    checkBan.status === 'checking' &&
    modalView !== null;

  const displayedLabel = useMemo(() => {
    if (!modalView) return '';
    const u = modalView.displayedUser;
    const handle = u.username?.replace(/^@/, '').trim();
    if (handle) return `@${handle}`;
    return formatSenderDisplayName(u.username, u.firstName);
  }, [modalView]);

  const answer = useCallback(
    async (completed: boolean) => {
      if (!checkBan?.id || !token || submitting || !modalView) return;
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
          challengeLog('check:done', {
            banId: checkBan.id,
            role: modalView.role,
          });
          clearCheckOverlay();
          openBanResult(res.result, 'live');
          void refreshUser();
        } else if (res.waiting) {
          challengeLog('check:waiting-ui', {
            banId: checkBan.id,
            role: modalView.role,
          });
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
      modalView,
      refreshUser,
      setCheckWaiting,
      openBanResult,
      submitting,
      token,
    ],
  );

  if (!open || !checkBan || !modalView) {
    return null;
  }

  const yesLabel =
    modalView.role === 'receiver' ? 'Выдержал' : 'Выполнил запрет';
  const noLabel =
    modalView.role === 'receiver' ? 'Не выдержал' : 'Не выполнил запрет';

  return (
    <ModalShell
      open
      light
      closeOnBackdrop={false}
      ariaLabel={modalView.title}
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
              {modalView.title}
            </p>
            {checkBan.remainingMs != null ? (
              <div className="check-modal-timer">
                <BanTimer remainingMs={checkBan.remainingMs} />
              </div>
            ) : null}
          </div>

          <div className="check-modal-sender mb-3">
            <PartyAvatar user={modalView.displayedUser} />
            <p className="text-muted text-xs mt-2">{displayedLabel}</p>
          </div>

          <p className="check-modal-text text-base font-semibold leading-snug mb-4">
            «{checkBan.text}»
          </p>

          <div className="check-modal-actions space-y-2.5">
            <BigButton
              className="check-answer-btn"
              disabled={submitting}
              aria-label={yesLabel}
              onClick={() => answer(true)}
            >
              ✅
            </BigButton>
            <BigButton
              variant="ghost"
              className="check-answer-btn"
              disabled={submitting}
              aria-label={noLabel}
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

function PartyAvatar({ user }: { user: UserPublic }) {
  const letter = (user.firstName?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar mx-auto overflow-hidden" aria-hidden>
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={letter}
        sizeClass="w-full h-full"
        textClass="text-lg"
      />
    </div>
  );
}
