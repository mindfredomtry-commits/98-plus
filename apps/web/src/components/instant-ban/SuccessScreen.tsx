'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { BigButton } from '../BigButton';
import { LobbyBanMark, SuccessBanCardBody } from './SuccessBanCardBody';
import { traceSuccessCardUnmounted } from '@/lib/success-card-trace';
import { logSuccessExitClick } from '@/lib/success-exit-first-notification-debug';

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  onExitComplete: () => void;
  onShare: () => void;
  /**
   * Stage 3A: keep the settled SUCCESS card visible (entered frame) during
   * SUCCESS_HANDOFF_WAIT. No exit animation, no entrance replay. Parent unmounts
   * SuccessOverlay only on handoff terminal.
   */
  freezeFinalFrame?: boolean;
};

type CardFrame = 'enter' | 'entered' | 'frozen';

function frameClassName(frame: CardFrame): string {
  // enter only once on first mount; entered/frozen both use --entered (no exit).
  return frame === 'enter'
    ? 'instant-ban-success-card--enter'
    : 'instant-ban-success-card--entered';
}

export function SuccessScreen({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onExitComplete,
  onShare,
  freezeFinalFrame = false,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const [cardFrame, setCardFrame] = useState<CardFrame>('enter');

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

  // Stage 3A retain: lock entered frame without re-applying --enter.
  useLayoutEffect(() => {
    if (!freezeFinalFrame) return;
    setCardFrame((prev) => (prev === 'frozen' ? prev : 'frozen'));
  }, [freezeFinalFrame]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    if (cardFrame !== 'enter') return;

    const settle = () => {
      setCardFrame((prev) => (prev === 'enter' ? 'entered' : prev));
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
  }, [cardFrame]);

  const handleAgain = useCallback(() => {
    window.__debug98log?.('[SUCCESS CTA CLICK]', {
      exitingRef: exitingRef.current,
      isExiting,
      hasCardNode: Boolean(cardRef.current),
      freezeFinalFrame,
      cardFrame,
    });
    if (exitingRef.current) return;
    logSuccessExitClick();
    exitingRef.current = true;
    setIsExiting(true);
    // Freeze final visible frame; handoff owns when SuccessOverlay unmounts.
    // Do not apply --exit (that was the production-visible blank gap).
    setCardFrame('frozen');
    callOnExitComplete(cardRef.current ? 'freeze-final-frame' : 'no-card-node');
  }, [callOnExitComplete, cardFrame, freezeFinalFrame, isExiting]);

  return (
    <div
      className="instant-ban-success-screen"
      data-success-freeze-final-frame={
        freezeFinalFrame || cardFrame === 'frozen' ? '' : undefined
      }
    >
      <div
        ref={cardRef}
        className={`modal-card modal-card--incoming instant-ban-success-card ${frameClassName(cardFrame)}`}
        data-success-card-frame={cardFrame}
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
