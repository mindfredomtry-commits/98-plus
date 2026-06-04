'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { BigButton } from '../BigButton';
import { LobbyBanMark, SuccessBanCardBody } from './SuccessBanCardBody';

const SUCCESS_CARD_EXIT_MS = 220;

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  onExitComplete: () => void;
  onShare: () => void;
};

export function SuccessScreen({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onExitComplete,
  onShare,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    const settle = () => {
      node.classList.remove('instant-ban-success-card--enter');
      node.classList.add('instant-ban-success-card--entered');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle();
      return;
    }

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== node || event.animationName !== 'instant-ban-success-card-enter') {
        return;
      }
      settle();
    };

    node.addEventListener('animationend', onEnd);
    return () => node.removeEventListener('animationend', onEnd);
  }, []);

  const handleAgain = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    const node = cardRef.current;
    if (!node) {
      onExitComplete();
      return;
    }

    node.classList.remove(
      'instant-ban-success-card--enter',
      'instant-ban-success-card--entered',
    );
    node.classList.add('instant-ban-success-card--exit');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onExitComplete();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onExitComplete();
    };

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== node || event.animationName !== 'instant-ban-success-card-exit') {
        return;
      }
      finish();
    };

    node.addEventListener('animationend', onEnd);
    window.setTimeout(() => {
      node.removeEventListener('animationend', onEnd);
      finish();
    }, SUCCESS_CARD_EXIT_MS + 80);
  }, [onExitComplete]);

  return (
    <div className="instant-ban-success-screen">
      <div
        ref={cardRef}
        className="modal-card modal-card--incoming instant-ban-success-card instant-ban-success-card--enter"
      >
        <div className="modal-card-body text-center">
          <SuccessBanCardBody
            senderUser={senderUser}
            selectedUser={selectedUser}
            banText={banText}
            durationMinutes={durationMinutes}
          />
        </div>
        <div className="modal-card-actions space-y-2.5">
          <BigButton
            className="instant-ban-success-card__btn-primary"
            onClick={handleAgain}
            disabled={isExiting}
          >
            <span className="instant-ban-success-card__btn-label">
              <LobbyBanMark className="instant-ban-success-card__btn-emoji" />
              <span className="instant-ban-success-card__btn-text">Запретить ещё!</span>
            </span>
          </BigButton>
          <BigButton
            variant="ghost"
            className="instant-ban-success-card__btn-secondary"
            onClick={onShare}
            disabled={isExiting}
          >
            Поделиться
          </BigButton>
        </div>
      </div>
    </div>
  );
}
