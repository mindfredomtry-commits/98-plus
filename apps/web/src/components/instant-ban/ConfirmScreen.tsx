'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { SuccessBanCardBody } from './SuccessBanCardBody';

const HOLD_MS = 650;
const PAYOFF_MORPH_MS = 4000;
const CONFIRM_ENTER_LOBBY_HOLD_MS = 100;
const CONFIRM_ENTER_COMPRESS_MS = 600;

type HoldPhase = 'idle' | 'holding' | 'ready' | 'releasing';
type EnterPhase = 'lobby-orb' | 'compressing' | 'ready';
type PayoffPhase = 'idle' | 'expanding' | 'card';

type Props = {
  enterKey: number;
  /** Lobby ring fill 0–100; omitted → 100. */
  influencePercent?: number;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  sending: boolean;
  sendSucceeded: boolean;
  error: string | null;
  senderUser: UserPublic | null | undefined;
  onConfirm: () => void;
  onAgain: () => void;
  onRetry: () => void;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

function safeImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: { impactOccurred?: (s: string) => void };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* desktop / no Telegram */
  }
}

function safeNotification(type: 'success' | 'warning' | 'error'): void {
  try {
    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (t: string) => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* desktop / no Telegram */
  }
}

function clampInfluencePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(0, value));
}

export function ConfirmScreen({
  enterKey,
  influencePercent,
  selectedUser,
  banText,
  durationMinutes,
  sending,
  sendSucceeded,
  error,
  senderUser,
  onConfirm,
  onAgain,
  onRetry,
  onBack,
}: Props) {
  const name = friendLabel(selectedUser);
  const trimmed = banText.trim();
  const letter = (
    selectedUser.firstName?.[0] ??
    selectedUser.username?.[0] ??
    '?'
  ).toUpperCase();

  const influenceStart = useMemo(
    () => clampInfluencePercent(influencePercent),
    [influencePercent],
  );

  const [enterPhase, setEnterPhase] = useState<EnterPhase>('lobby-orb');
  const [ringProgress, setRingProgress] = useState(influenceStart);
  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const [payoffPhase, setPayoffPhase] = useState<PayoffPhase>('idle');
  const [morphDone, setMorphDone] = useState(false);
  const [bounce, setBounce] = useState(false);
  const enterComplete = enterPhase === 'ready';
  const showingPayoff = payoffPhase !== 'idle';

  const orbWrapRef = useRef<HTMLDivElement>(null);
  const orbStageRef = useRef<HTMLDivElement>(null);
  const orbBtnRef = useRef<HTMLButtonElement>(null);
  const holdPhaseRef = useRef<HoldPhase>('idle');
  const readyToReleaseRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTriggeredRef = useRef(false);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhase = useCallback((phase: HoldPhase) => {
    holdPhaseRef.current = phase;
    setHoldPhase(phase);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearMorphTimer = useCallback(() => {
    if (morphTimerRef.current) {
      clearTimeout(morphTimerRef.current);
      morphTimerRef.current = null;
    }
  }, []);

  const triggerBounce = useCallback(() => {
    if (bounceTimerRef.current) {
      clearTimeout(bounceTimerRef.current);
    }
    setBounce(true);
    bounceTimerRef.current = setTimeout(() => {
      bounceTimerRef.current = null;
      setBounce(false);
    }, 450);
  }, []);

  const cancelHold = useCallback(
    (withWarning: boolean) => {
      clearHoldTimer();
      readyToReleaseRef.current = false;
      if (holdPhaseRef.current !== 'idle' && holdPhaseRef.current !== 'releasing') {
        setPhase('idle');
        if (withWarning) {
          safeNotification('warning');
          triggerBounce();
        }
      }
    },
    [clearHoldTimer, setPhase, triggerBounce],
  );

  useEffect(() => {
    if (error) {
      sendTriggeredRef.current = false;
      setPayoffPhase('idle');
      setMorphDone(false);
      clearMorphTimer();
      setPhase('idle');
    }
  }, [error, clearMorphTimer, setPhase]);

  useEffect(() => {
    setEnterPhase('lobby-orb');
    setRingProgress(influenceStart);
    setPayoffPhase('idle');
    setMorphDone(false);
    sendTriggeredRef.current = false;
    clearMorphTimer();
    if (orbBtnRef.current) {
      orbBtnRef.current.style.removeProperty('--payoff-shift-x');
      orbBtnRef.current.style.removeProperty('--payoff-shift-y');
    }
    const compressTimer = window.setTimeout(() => {
      setEnterPhase('compressing');
    }, CONFIRM_ENTER_LOBBY_HOLD_MS);
    const readyTimer = window.setTimeout(() => {
      setEnterPhase('ready');
    }, CONFIRM_ENTER_LOBBY_HOLD_MS + CONFIRM_ENTER_COMPRESS_MS);

    return () => {
      window.clearTimeout(compressTimer);
      window.clearTimeout(readyTimer);
    };
  }, [enterKey, influenceStart, clearMorphTimer]);

  useEffect(() => {
    if (payoffPhase === 'expanding' && morphDone && sendSucceeded) {
      setPayoffPhase('card');
      setPhase('idle');
    }
  }, [payoffPhase, morphDone, sendSucceeded, setPhase]);

  useEffect(() => {
    if (enterPhase !== 'compressing') return;
    const frame = requestAnimationFrame(() => {
      setRingProgress(100);
    });
    return () => cancelAnimationFrame(frame);
  }, [enterPhase]);

  useLayoutEffect(() => {
    const wrap = orbWrapRef.current;
    const stage = orbStageRef.current;
    if (!wrap || !stage) return;

    const wrapRect = wrap.getBoundingClientRect();
    const wrapCenterX = wrapRect.left + wrapRect.width / 2;
    const wrapCenterY = wrapRect.top + wrapRect.height / 2;
    const marginBottom = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--98-lobby-orb-wrap-margin-bottom',
      ),
    );
    const lobbyCenterY =
      window.innerHeight / 2 -
      (Number.isFinite(marginBottom) ? marginBottom / 2 : 0);
    const lobbyCenterX = window.innerWidth / 2;

    stage.style.setProperty('--orb-enter-x', `${lobbyCenterX - wrapCenterX}px`);
    stage.style.setProperty('--orb-enter-y', `${lobbyCenterY - wrapCenterY}px`);
  }, [enterKey]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearMorphTimer();
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
      }
    };
  }, [clearHoldTimer, clearMorphTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!enterComplete || sending || sendTriggeredRef.current || showingPayoff || e.button !== 0) {
        return;
      }
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      clearHoldTimer();
      readyToReleaseRef.current = false;
      setPhase('holding');
      safeImpact('light');
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        if (holdPhaseRef.current !== 'holding') return;
        readyToReleaseRef.current = true;
        setPhase('ready');
        safeNotification('success');
      }, HOLD_MS);
    },
    [enterComplete, sending, showingPayoff, clearHoldTimer, setPhase],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!enterComplete || sending || sendTriggeredRef.current || showingPayoff) return;
      clearHoldTimer();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* noop */
      }

      if (readyToReleaseRef.current) {
        readyToReleaseRef.current = false;
        sendTriggeredRef.current = true;
        setPhase('releasing');
        setPayoffPhase('expanding');
        setMorphDone(false);
        const btnRect = e.currentTarget.getBoundingClientRect();
        const dx = window.innerWidth / 2 - (btnRect.left + btnRect.width / 2);
        const dy = window.innerHeight / 2 - (btnRect.top + btnRect.height / 2);
        e.currentTarget.style.setProperty('--payoff-shift-x', `${dx}px`);
        e.currentTarget.style.setProperty('--payoff-shift-y', `${dy}px`);
        clearMorphTimer();
        morphTimerRef.current = setTimeout(() => {
          morphTimerRef.current = null;
          setMorphDone(true);
        }, PAYOFF_MORPH_MS);
        onConfirm();
        return;
      }

      if (
        holdPhaseRef.current === 'holding' ||
        holdPhaseRef.current === 'ready'
      ) {
        readyToReleaseRef.current = false;
        setPhase('idle');
        safeNotification('warning');
        triggerBounce();
      }
    },
    [
      enterComplete,
      sending,
      showingPayoff,
      clearHoldTimer,
      clearMorphTimer,
      setPhase,
      onConfirm,
      triggerBounce,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (!enterComplete || sending || sendTriggeredRef.current || showingPayoff) return;
    cancelHold(true);
  }, [enterComplete, sending, showingPayoff, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    if (!enterComplete || sending || sendTriggeredRef.current || showingPayoff) return;
    if (holdPhaseRef.current === 'idle' || holdPhaseRef.current === 'releasing') {
      return;
    }
    cancelHold(true);
  }, [enterComplete, sending, showingPayoff, cancelHold]);

  const handleOrbClick = useCallback(() => {
    if (payoffPhase === 'card') {
      onAgain();
    }
  }, [payoffPhase, onAgain]);

  const orbBtnClass = [
    'instant-ban-confirm-orb-btn',
    holdPhase === 'holding' ? 'instant-ban-confirm-orb-btn--holding' : '',
    holdPhase === 'ready' ? 'instant-ban-confirm-orb-btn--ready' : '',
    holdPhase === 'releasing' ? 'instant-ban-confirm-orb-btn--releasing' : '',
    payoffPhase === 'expanding' ? 'instant-ban-confirm-orb-btn--expanding-to-card' : '',
    payoffPhase === 'card' ? 'instant-ban-confirm-orb-btn--card-ready' : '',
    bounce ? 'instant-ban-confirm-orb-btn--bounce' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel = payoffPhase === 'card'
    ? ''
    : sending || payoffPhase === 'expanding'
    ? 'Запрет отправляется…'
    : error
      ? 'Не получилось отправить запрет'
      : holdPhase === 'ready'
        ? 'Отпусти'
        : holdPhase === 'holding'
          ? 'Держи…'
          : 'Зажми';

  return (
    <div
      className="instant-ban-confirm"
      data-confirm-enter-key={enterKey}
      data-enter-phase={enterPhase}
      data-payoff-phase={payoffPhase}
      data-instant-ban-view="ConfirmScreen"
    >
      {!showingPayoff ? (
        <button type="button" className="instant-ban-flow__back" onClick={onBack}>
          ← Назад
        </button>
      ) : null}
      <div className={`instant-ban-confirm-copy${showingPayoff ? ' instant-ban-confirm-copy--hidden' : ''}`}>
        <span className="instant-ban-confirm-copy__lead instant-ban-confirm-enter instant-ban-confirm-enter--1">
          Ты запрещаешь
        </span>
        <div className="instant-ban-confirm-copy__subject instant-ban-confirm-enter instant-ban-confirm-enter--2">
          <strong>{name}</strong>
          <div className="instant-ban-confirm-copy__avatar">
            <AvatarImage
              src={friendAvatarUrl(selectedUser)}
              letter={letter}
              sizeClass="w-12 h-12"
              textClass="text-base"
              priority
            />
          </div>
        </div>
        <em className="instant-ban-confirm-enter instant-ban-confirm-enter--3">
          &ldquo;{trimmed}&rdquo;
        </em>
      </div>
      <div ref={orbWrapRef} className="instant-ban-confirm-orb-wrap">
        <div ref={orbStageRef} className="instant-ban-confirm-orb-stage">
          <button
            ref={orbBtnRef}
            type="button"
            className={orbBtnClass}
            disabled={(payoffPhase !== 'card' && sending) || (payoffPhase === 'idle' && !enterComplete)}
            aria-label="Зажми 98+ чтобы отправить запрет"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
            onClick={handleOrbClick}
          >
            <span className="instant-ban-confirm-orb-ring" aria-hidden>
              <InfluenceRing
                value={ringProgress}
                className="instant-ban-confirm-influence-ring"
              />
            </span>
            <span className="instant-ban-confirm-orb">
              <span className="instant-ban-confirm-orb__title">98+</span>
            </span>
            <div className="instant-ban-confirm-success-content">
              <SuccessBanCardBody
                senderUser={senderUser}
                selectedUser={selectedUser}
                banText={banText}
                durationMinutes={durationMinutes}
              />
              <span className="btn-98-primary instant-ban-success-card__again-pill">
                Запретить ещё!
              </span>
            </div>
          </button>
        </div>
        <p
          className={`instant-ban-status instant-ban-confirm-enter instant-ban-confirm-enter--5${
            error ? ' instant-ban-status--error' : ''
          }`}
        >
          {statusLabel}
        </p>
        {error ? (
          <button type="button" className="instant-ban-secondary" onClick={onRetry}>
            Попробовать снова
          </button>
        ) : null}
      </div>
    </div>
  );
}
