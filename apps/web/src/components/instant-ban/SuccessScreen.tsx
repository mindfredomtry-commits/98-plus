'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { BigButton } from '../BigButton';
import { LobbyBanMark, SuccessBanCardBody } from './SuccessBanCardBody';
import { traceSuccessCardUnmounted } from '@/lib/success-card-trace';
import { logSuccessExitClick } from '@/lib/success-exit-first-notification-debug';

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

  useEffect(() => {
    window.__debug98log?.('[SUCCESS ON_EXIT_COMPLETE PROP]', {
      hasHandler: typeof onExitComplete === 'function',
      handlerName: onExitComplete.name || 'anonymous',
    });
    return () => {
      traceSuccessCardUnmounted({ component: 'SuccessScreen' });
    };
  }, [onExitComplete]);

  const callOnExitComplete = useCallback(
    (source: string) => {
      window.__debug98log?.('[SUCCESS EXIT COMPLETE CALLED]', { source });
      onExitComplete();
    },
    [onExitComplete],
  );

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
    window.__debug98log?.('[SUCCESS CTA CLICK]', {
      exitingRef: exitingRef.current,
      isExiting,
      hasCardNode: Boolean(cardRef.current),
    });
    if (exitingRef.current) return;
    logSuccessExitClick();
    exitingRef.current = true;

    const node = cardRef.current;
    if (!node) {
      callOnExitComplete('no-card-node');
      return;
    }

    node.classList.remove(
      'instant-ban-success-card--enter',
      'instant-ban-success-card--entered',
    );
    node.classList.add('instant-ban-success-card--exit');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      callOnExitComplete('reduced-motion');
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      callOnExitComplete('exit-animation');
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
  }, [callOnExitComplete, isExiting]);

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
