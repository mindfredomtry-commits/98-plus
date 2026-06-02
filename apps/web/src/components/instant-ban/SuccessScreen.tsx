'use client';

import { useLayoutEffect, useRef } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { SuccessBanCardBody } from './SuccessBanCardBody';
import {
  PAYOFF_MORPH_MS,
  type PayoffAnchor,
  resolvePayoffCardWidth,
} from './payoff-anchor';

type Props = {
  morphAnchor: PayoffAnchor;
  morphActive: boolean;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  onMorphComplete: () => void;
  onAgain: () => void;
};

export function SuccessScreen({
  morphAnchor,
  morphActive,
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  onMorphComplete,
  onAgain,
}: Props) {
  const morphRef = useRef<HTMLDivElement>(null);
  const morphDoneRef = useRef(false);

  useLayoutEffect(() => {
    if (!morphActive) return;
    const el = morphRef.current;
    if (!el) return;

    morphDoneRef.current = false;
    el.classList.remove('instant-ban-payoff-morph--to-card');

    const cardWidth = resolvePayoffCardWidth();
    const scaleStart = morphAnchor.size / cardWidth;
    const dx = morphAnchor.centerX - window.innerWidth / 2;
    const dy = morphAnchor.centerY - window.innerHeight / 2;

    el.style.setProperty('--morph-dx', `${dx}px`);
    el.style.setProperty('--morph-dy', `${dy}px`);
    el.style.setProperty('--morph-scale', String(scaleStart));

    const finishMorph = () => {
      if (morphDoneRef.current) return;
      morphDoneRef.current = true;
      onMorphComplete();
    };

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== 'transform') return;
      finishMorph();
    };

    el.addEventListener('transitionend', handleTransitionEnd);
    const fallbackTimer = window.setTimeout(finishMorph, PAYOFF_MORPH_MS + 80);

    const startFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('instant-ban-payoff-morph--to-card');
      });
    });

    return () => {
      cancelAnimationFrame(startFrame);
      window.clearTimeout(fallbackTimer);
      el.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, [morphActive, morphAnchor, onMorphComplete]);

  return (
    <div className="instant-ban-success-root">
      <div
        ref={morphRef}
        className={`instant-ban-payoff-morph${
          morphActive
            ? ' instant-ban-payoff-morph--from-orb'
            : ' instant-ban-payoff-morph--to-card'
        }`}
      >
        {morphActive ? (
          <span className="instant-ban-payoff-morph__orb-label" aria-hidden>
            98+
          </span>
        ) : null}
        <div className="instant-ban-payoff-morph__content">
          <SuccessBanCardBody
            senderUser={senderUser}
            selectedUser={selectedUser}
            banText={banText}
            durationMinutes={durationMinutes}
          />
          <button
            type="button"
            className="btn-98-primary instant-ban-success-card__again"
            onClick={onAgain}
          >
            Запретить ещё!
          </button>
        </div>
      </div>
    </div>
  );
}
