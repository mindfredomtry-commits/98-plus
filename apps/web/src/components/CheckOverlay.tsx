'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatSenderDisplayName,
  getCheckModalView,
  getCheckViewerRole,
} from '@98plus/shared';
import type { BanInteraction, UserPublic } from '@98plus/shared';
import { useApp } from './AppContext';
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
    checkGateActive,
    submitCheckAnswer,
  } = useApp();
  const { haptic } = useTelegram();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const modalView = useMemo(() => {
    if (!checkBan) return null;
    return getCheckModalView(checkBan, user?.id ?? null);
  }, [checkBan, user?.id]);

  useEffect(() => {
    if (!checkBan?.id) return;
    const role = getCheckViewerRole(
      user?.id ?? null,
      checkBan.sender.id,
      checkBan.receiver.id,
    );
    console.log('[check-debug]', {
      authUserId: user?.id ?? null,
      checkBanId: checkBan.id,
      role,
      shouldShow: checkGateActive,
      reason: checkGateActive ? 'shown' : 'guard-rejected',
    });
  }, [checkBan, user?.id, checkGateActive]);

  const displayedLabel = useMemo(() => {
    if (!modalView) return '';
    const u = modalView.displayedUser;
    const handle = u.username?.replace(/^@/, '').trim();
    if (handle) return `@${handle}`;
    return formatSenderDisplayName(u.username, u.firstName);
  }, [modalView]);

  const answer = useCallback(
    async (completed: boolean) => {
      if (!checkBan?.id || !token || !modalView) return;
      haptic('light');
      setSubmitError(null);
      challengeLog('check:answer-click', {
        banId: checkBan.id,
        completed,
        role: modalView.role,
      });
      const res = await submitCheckAnswer(checkBan.id, completed);
      if (!res.ok && res.error) {
        setSubmitError(res.error);
      }
    },
    [checkBan?.id, haptic, modalView, submitCheckAnswer, token],
  );

  if (
    !checkGateActive ||
    !checkBan ||
    !token ||
    !user?.id ||
    !modalView
  ) {
    return null;
  }

  const yesLabel =
    modalView.role === 'receiver' ? 'Выдержал' : 'Выполнил запрет';
  const noLabel =
    modalView.role === 'receiver' ? 'Не выдержал' : 'Не выполнил запрет';

  const modal = (
    <ModalShell
      open
      light
      stable
      zIndex={70}
      closeOnBackdrop={false}
      ariaLabel={modalView.title}
      onClose={() => {}}
      cardClassName="modal-card--check"
    >
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

        {submitError ? (
          <p className="text-warning text-xs mb-3 whitespace-pre-wrap">
            {submitError}
          </p>
        ) : null}

        <div className="check-modal-actions space-y-2.5">
          <BigButton
            className="check-answer-btn"
            aria-label={yesLabel}
            onClick={() => void answer(true)}
          >
            ✅
          </BigButton>
          <BigButton
            variant="ghost"
            className="check-answer-btn"
            aria-label={noLabel}
            onClick={() => void answer(false)}
          >
            ❌
          </BigButton>
        </div>
      </div>
    </ModalShell>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
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
        priority
      />
    </div>
  );
}
