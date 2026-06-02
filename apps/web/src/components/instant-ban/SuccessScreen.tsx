'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { SuccessBanCardBody } from './SuccessBanCardBody';
import {
  PAYOFF_CARD_MIN_HEIGHT,
  PAYOFF_MORPH_MS,
  type PayoffAnchor,
  resolvePayoffCardWidth,
} from './payoff-anchor';

type MorphPhase = 'idle' | 'circle' | 'morphing' | 'done';

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
  const [morphPhase, setMorphPhase] = useState<MorphPhase>(
    morphActive ? 'circle' : 'done',
  );

  useLayoutEffect(() => {
    if (!morphActive) {
      setMorphPhase('done');
      return;
    }

    const el = morphRef.current;
    if (!el) return;

    morphDoneRef.current = false;
    setMorphPhase('circle');
    el.classList.remove('instant-ban-payoff-morph--to-card');

    const cardWidth = resolvePayoffCardWidth();
    const endLeft = window.innerWidth / 2;
    const endTop = window.innerHeight / 2;

    el.style.setProperty('--morph-left', `${morphAnchor.centerX}px`);
    el.style.setProperty('--morph-top', `${morphAnchor.centerY}px`);
    el.style.setProperty('--morph-width', `${morphAnchor.width}px`);
    el.style.setProperty('--morph-height', `${morphAnchor.height}px`);
    el.style.setProperty('--morph-end-left', `${endLeft}px`);
    el.style.setProperty('--morph-end-top', `${endTop}px`);
    el.style.setProperty('--morph-end-width', `${cardWidth}px`);
    el.style.setProperty('--morph-end-height', `${PAYOFF_CARD_MIN_HEIGHT}px`);

    const finishMorph = () => {
      if (morphDoneRef.current) return;
      morphDoneRef.current = true;
      onMorphComplete();
    };

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== el) return;
      if (event.propertyName !== 'width' && event.propertyName !== 'left') return;
      finishMorph();
    };

    el.addEventListener('transitionend', handleTransitionEnd);
    const fallbackTimer = window.setTimeout(finishMorph, PAYOFF_MORPH_MS + 80);

    const startFrame = requestAnimationFrame(() => {
      setMorphPhase('morphing');
      el.classList.add('instant-ban-payoff-morph--to-card');
    });

    return () => {
      cancelAnimationFrame(startFrame);
      window.clearTimeout(fallbackTimer);
      el.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, [morphActive, morphAnchor, onMorphComplete]);

  const showOrbLabel = morphPhase === 'circle' || morphPhase === 'morphing';
  const cardWidth = resolvePayoffCardWidth();

  const morphStyle = {
    '--morph-left': `${morphAnchor.centerX}px`,
    '--morph-top': `${morphAnchor.centerY}px`,
    '--morph-width': `${morphAnchor.width}px`,
    '--morph-height': `${morphAnchor.height}px`,
    '--morph-end-left': '50%',
    '--morph-end-top': '50%',
    '--morph-end-width': `${cardWidth}px`,
    '--morph-end-height': `${PAYOFF_CARD_MIN_HEIGHT}px`,
  } as CSSProperties;

  return (
    <div
      className={`instant-ban-success-root${
        morphPhase === 'done' ? ' instant-ban-success-root--interactive' : ''
      }`}
    >
      <div
        ref={morphRef}
        style={morphStyle}
        className={`instant-ban-payoff-morph${
          morphPhase === 'circle' ? ' instant-ban-payoff-morph--circle' : ''
        }${morphPhase === 'morphing' || morphPhase === 'done' ? ' instant-ban-payoff-morph--to-card' : ''}${
          morphPhase === 'done' ? ' instant-ban-payoff-morph--settled' : ''
        }`}
        data-morph-phase={morphPhase}
      >
        {showOrbLabel ? (
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
