'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';
import { InfluenceRing } from '../lobby/InfluenceRing';
import { instantBanDebug } from '@/lib/instant-ban-debug';
import { SuccessPayoffReveal } from './SuccessPayoffReveal';

const HOLD_MS = 650;
const RELEASE_IMPACT_MS = 250;
const PAYOFF_MORPH_MS = 4000;
const PAYOFF_SETTLE_MS = 450;
const REVEAL_STAGGER_MS = 100;
const REVEAL_ITEM_MS = 280;
const CTA_EXTRA_DELAY_MS = 120;
const CONFIRM_ENTER_LOBBY_HOLD_MS = 100;
const CONFIRM_ENTER_COMPRESS_MS = 600;

type HoldPhase = 'idle' | 'holding' | 'ready' | 'releasing';
type EnterPhase = 'lobby-orb' | 'compressing' | 'ready';
type PayoffPhase =
  | 'none'
  | 'impact'
  | 'morph'
  | 'settle'
  | 'reveal'
  | 'cta'
  | 'ready';

type ConfirmSendContext = {
  payoffPhase: string;
  sendTriggered: boolean;
};

type Props = {
  enterKey: number;
  influencePercent?: number;
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  sending: boolean;
  error: string | null;
  payoffArmToken: number;
  onConfirm: () => void;
  onAgain: () => void;
  onRetry: () => void;
  onBack: () => void;
  onSendContextChange: (ctx: ConfirmSendContext) => void;
  onBindAbortRelease: (abort: () => void) => void;
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

function clearPayoffShellStyles(el: HTMLButtonElement | null): void {
  if (!el) return;
  el.classList.remove('instant-ban-confirm-orb-btn--payoff-geometry-run');
  el.style.removeProperty('left');
  el.style.removeProperty('top');
  el.style.removeProperty('width');
  el.style.removeProperty('height');
  el.style.removeProperty('border-radius');
  el.style.removeProperty('transform');
  el.style.removeProperty('--payoff-x0');
  el.style.removeProperty('--payoff-y0');
  el.style.removeProperty('--payoff-w0');
  el.style.removeProperty('--payoff-h0');
}

export function ConfirmScreen({
  enterKey,
  influencePercent,
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  sending,
  error,
  payoffArmToken,
  onConfirm,
  onAgain,
  onRetry,
  onBack,
  onSendContextChange,
  onBindAbortRelease,
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
  const [payoffPhase, setPayoffPhase] = useState<PayoffPhase>('none');
  const [bounce, setBounce] = useState(false);
  const enterComplete = enterPhase === 'ready';
  const payoffActive = payoffPhase !== 'none';

  const orbWrapRef = useRef<HTMLDivElement>(null);
  const orbStageRef = useRef<HTMLDivElement>(null);
  const orbBtnRef = useRef<HTMLButtonElement>(null);
  const holdPhaseRef = useRef<HoldPhase>('idle');
  const payoffPhaseRef = useRef<PayoffPhase>('none');
  const readyToReleaseRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTriggeredRef = useRef(false);
  const payoffPendingRef = useRef(false);
  const payoffArmSeenRef = useRef(0);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPhase = useCallback((phase: HoldPhase) => {
    holdPhaseRef.current = phase;
    setHoldPhase(phase);
  }, []);

  const setPayoff = useCallback((phase: PayoffPhase) => {
    payoffPhaseRef.current = phase;
    setPayoffPhase(phase);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearPayoffTimer = useCallback(() => {
    if (payoffTimerRef.current) {
      clearTimeout(payoffTimerRef.current);
      payoffTimerRef.current = null;
    }
  }, []);

  const schedulePayoff = useCallback(
    (delayMs: number, next: PayoffPhase) => {
      clearPayoffTimer();
      payoffTimerRef.current = setTimeout(() => {
        payoffTimerRef.current = null;
        setPayoff(next);
      }, delayMs);
    },
    [clearPayoffTimer, setPayoff],
  );

  const abortRelease = useCallback(() => {
    payoffPendingRef.current = false;
    sendTriggeredRef.current = false;
    readyToReleaseRef.current = false;
    setPhase('idle');
    setPayoff('none');
    clearPayoffShellStyles(orbBtnRef.current);
  }, [setPayoff, setPhase]);

  const resetPayoff = useCallback(() => {
    clearPayoffTimer();
    payoffPendingRef.current = false;
    setPayoff('none');
    setPhase('idle');
    sendTriggeredRef.current = false;
    clearPayoffShellStyles(orbBtnRef.current);
  }, [clearPayoffTimer, setPayoff, setPhase]);

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
      if (payoffActive) return;
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
    [clearHoldTimer, payoffActive, setPhase, triggerBounce],
  );

  useEffect(() => {
    onBindAbortRelease(abortRelease);
  }, [onBindAbortRelease, abortRelease]);

  useEffect(() => {
    onSendContextChange({
      payoffPhase: payoffPhaseRef.current,
      sendTriggered: sendTriggeredRef.current,
    });
  });

  useEffect(() => {
    if (payoffArmToken === 0 || payoffArmToken === payoffArmSeenRef.current) {
      return;
    }
    payoffArmSeenRef.current = payoffArmToken;
    if (!payoffPendingRef.current) {
      instantBanDebug('payoff-skip', { reason: 'not-pending', payoffArmToken });
      return;
    }
    payoffPendingRef.current = false;
    instantBanDebug('payoff-start', { payoffArmToken });
    setPayoff('impact');
  }, [payoffArmToken, setPayoff]);

  useEffect(() => {
    if (error) {
      resetPayoff();
    }
  }, [error, resetPayoff]);

  useEffect(() => {
    setEnterPhase('lobby-orb');
    setRingProgress(influenceStart);
    sendTriggeredRef.current = false;
    payoffPendingRef.current = false;
    payoffArmSeenRef.current = 0;
    setPayoff('none');
    clearPayoffTimer();
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
  }, [enterKey, influenceStart, clearPayoffTimer, setPayoff]);

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

  useLayoutEffect(() => {
    const btn = orbBtnRef.current;
    if (!btn) return;

    if (payoffPhase !== 'morph') {
      return;
    }

    btn.classList.remove('instant-ban-confirm-orb-btn--payoff-geometry-run');

    const rect = btn.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const startW = rect.width;
    const startH = rect.height;

    btn.style.setProperty('--payoff-x0', `${startX}px`);
    btn.style.setProperty('--payoff-y0', `${startY}px`);
    btn.style.setProperty('--payoff-w0', `${startW}px`);
    btn.style.setProperty('--payoff-h0', `${startH}px`);
    btn.style.left = `${startX}px`;
    btn.style.top = `${startY}px`;
    btn.style.width = `${startW}px`;
    btn.style.height = `${startH}px`;
    btn.style.borderRadius = '50%';
    btn.style.transform = 'translate(-50%, -50%)';

    void btn.offsetHeight;

    const frame = requestAnimationFrame(() => {
      btn.classList.add('instant-ban-confirm-orb-btn--payoff-geometry-run');
    });

    return () => cancelAnimationFrame(frame);
  }, [payoffPhase]);

  useEffect(() => {
    if (payoffPhase !== 'impact') return;
    schedulePayoff(RELEASE_IMPACT_MS, 'morph');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'morph') return;
    schedulePayoff(PAYOFF_MORPH_MS, 'settle');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'settle') return;
    schedulePayoff(PAYOFF_SETTLE_MS, 'reveal');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'reveal') return;
    const contentDuration =
      REVEAL_ITEM_MS + REVEAL_STAGGER_MS * 4;
    schedulePayoff(contentDuration, 'cta');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'cta') return;
    schedulePayoff(REVEAL_ITEM_MS + CTA_EXTRA_DELAY_MS, 'ready');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearPayoffTimer();
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
      }
    };
  }, [clearHoldTimer, clearPayoffTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (
        !enterComplete ||
        sending ||
        sendTriggeredRef.current ||
        payoffActive ||
        e.button !== 0
      ) {
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
    [enterComplete, sending, payoffActive, clearHoldTimer, setPhase],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (
        !enterComplete ||
        sending ||
        sendTriggeredRef.current ||
        payoffActive
      ) {
        return;
      }
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
        payoffPendingRef.current = true;
        setPhase('releasing');
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
      payoffActive,
      clearHoldTimer,
      setPhase,
      setPayoff,
      onConfirm,
      triggerBounce,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (!enterComplete || sending || sendTriggeredRef.current || payoffActive) {
      return;
    }
    cancelHold(true);
  }, [enterComplete, sending, payoffActive, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    if (!enterComplete || sending || sendTriggeredRef.current || payoffActive) {
      return;
    }
    if (holdPhaseRef.current === 'idle' || holdPhaseRef.current === 'releasing') {
      return;
    }
    cancelHold(true);
  }, [enterComplete, sending, payoffActive, cancelHold]);

  const orbBtnClass = [
    'instant-ban-confirm-orb-btn',
    holdPhase === 'holding' ? 'instant-ban-confirm-orb-btn--holding' : '',
    holdPhase === 'ready' ? 'instant-ban-confirm-orb-btn--ready' : '',
    holdPhase === 'releasing' ? 'instant-ban-confirm-orb-btn--releasing' : '',
    bounce ? 'instant-ban-confirm-orb-btn--bounce' : '',
    payoffPhase === 'impact' ? 'instant-ban-confirm-orb-btn--payoff-impact' : '',
    payoffPhase === 'morph' ? 'instant-ban-confirm-orb-btn--payoff-geometry' : '',
    payoffPhase === 'settle' ? 'instant-ban-confirm-orb-btn--payoff-settle' : '',
    payoffPhase === 'settle' ||
    payoffPhase === 'reveal' ||
    payoffPhase === 'cta' ||
    payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-card-skin'
      : '',
    payoffPhase === 'reveal' || payoffPhase === 'cta' || payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-reveal'
      : '',
    payoffPhase === 'cta' || payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-cta'
      : '',
    payoffPhase === 'ready' ? 'instant-ban-confirm-orb-btn--payoff-ready' : '',
    payoffPhase === 'morph' ||
    payoffPhase === 'settle' ||
    payoffPhase === 'reveal' ||
    payoffPhase === 'cta' ||
    payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-shell'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel = payoffActive
    ? ''
    : sending
      ? 'Запрет отправляется…'
      : error
        ? 'Не получилось отправить запрет'
        : holdPhase === 'ready'
          ? 'Отпусти'
          : holdPhase === 'holding'
            ? 'Держи…'
            : 'Зажми';

  const showPayoffContent =
    payoffPhase === 'reveal' ||
    payoffPhase === 'cta' ||
    payoffPhase === 'ready';
  const showPayoffCta = payoffPhase === 'cta' || payoffPhase === 'ready';
  const showOrbFace =
    payoffPhase === 'none' ||
    payoffPhase === 'impact' ||
    payoffPhase === 'morph' ||
    payoffPhase === 'settle';

  return (
    <div
      className="instant-ban-confirm"
      data-confirm-enter-key={enterKey}
      data-enter-phase={enterPhase}
      data-payoff-phase={payoffPhase}
      data-instant-ban-view="ConfirmScreen"
    >
      {!payoffActive ? (
        <button type="button" className="instant-ban-flow__back" onClick={onBack}>
          ← Назад
        </button>
      ) : null}
      <div
        className={`instant-ban-confirm-copy${
          payoffActive ? ' instant-ban-confirm-copy--hidden' : ''
        }`}
      >
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
      <div
        ref={orbWrapRef}
        className={`instant-ban-confirm-orb-wrap${
          payoffPhase === 'morph' ||
          payoffPhase === 'settle' ||
          payoffPhase === 'reveal' ||
          payoffPhase === 'cta' ||
          payoffPhase === 'ready'
            ? ' instant-ban-confirm-orb-wrap--payoff'
            : ''
        }`}
      >
        <div ref={orbStageRef} className="instant-ban-confirm-orb-stage">
          <button
            ref={orbBtnRef}
            type="button"
            className={orbBtnClass}
            disabled={
              (sending && !payoffActive) ||
              (!enterComplete && !payoffActive) ||
              (payoffActive && payoffPhase !== 'ready')
            }
            aria-label={
              payoffActive
                ? 'Запрет отправлен'
                : 'Зажми 98+ чтобы отправить запрет'
            }
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
          >
            {showOrbFace ? (
              <span className="instant-ban-confirm-orb-face">
                <span className="instant-ban-confirm-orb-ring">
                  <InfluenceRing
                    value={ringProgress}
                    className="instant-ban-confirm-influence-ring"
                  />
                </span>
                <span className="instant-ban-confirm-orb">
                  <span className="instant-ban-confirm-orb__title">98+</span>
                </span>
              </span>
            ) : null}
            {showPayoffContent ? (
              <SuccessPayoffReveal
                senderUser={senderUser}
                selectedUser={selectedUser}
                banText={banText}
                durationMinutes={durationMinutes}
                showCta={showPayoffCta}
                onAgain={payoffPhase === 'ready' ? onAgain : undefined}
              />
            ) : null}
          </button>
        </div>
        {!payoffActive ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
