'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

const HOLD_MS = 650;
const RELEASE_RESET_MS = 800;

type HoldPhase = 'idle' | 'holding' | 'ready' | 'releasing';

type Props = {
  enterKey: number;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
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

export function ConfirmScreen({
  selectedUser,
  banText,
  durationMinutes: _durationMinutes,
  sending,
  error,
  onConfirm,
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

  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const [bounce, setBounce] = useState(false);

  const holdPhaseRef = useRef<HoldPhase>('idle');
  const readyToReleaseRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTriggeredRef = useRef(false);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
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
    }
  }, [error]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearReleaseTimer();
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
      }
    };
  }, [clearHoldTimer, clearReleaseTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (sending || sendTriggeredRef.current || e.button !== 0) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      clearHoldTimer();
      clearReleaseTimer();
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
    [sending, clearHoldTimer, clearReleaseTimer, setPhase],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (sending || sendTriggeredRef.current) return;
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
        onConfirm();
        clearReleaseTimer();
        releaseTimerRef.current = setTimeout(() => {
          releaseTimerRef.current = null;
          if (!sendTriggeredRef.current) return;
          setPhase('idle');
        }, RELEASE_RESET_MS);
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
      sending,
      clearHoldTimer,
      clearReleaseTimer,
      setPhase,
      onConfirm,
      triggerBounce,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (sending || sendTriggeredRef.current) return;
    cancelHold(true);
  }, [sending, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    if (sending || sendTriggeredRef.current) return;
    if (holdPhaseRef.current === 'idle' || holdPhaseRef.current === 'releasing') {
      return;
    }
    cancelHold(true);
  }, [sending, cancelHold]);

  const orbBtnClass = [
    'instant-ban-confirm-orb-btn',
    holdPhase === 'holding' ? 'instant-ban-confirm-orb-btn--holding' : '',
    holdPhase === 'ready' ? 'instant-ban-confirm-orb-btn--ready' : '',
    holdPhase === 'releasing' ? 'instant-ban-confirm-orb-btn--releasing' : '',
    bounce ? 'instant-ban-confirm-orb-btn--bounce' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel = sending
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
      data-instant-ban-view="ConfirmScreen"
    >
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <div className="instant-ban-confirm-copy">
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
      <div className="instant-ban-confirm-orb-wrap">
        <button
          type="button"
          className={`${orbBtnClass} instant-ban-confirm-enter instant-ban-confirm-enter--4`}
          disabled={sending}
          aria-label="Зажми 98+ чтобы отправить запрет"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
        >
          <span className="instant-ban-confirm-orb-ring" aria-hidden />
          <span className="instant-ban-confirm-orb">
            <span className="instant-ban-confirm-orb__title">98+</span>
          </span>
        </button>
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
