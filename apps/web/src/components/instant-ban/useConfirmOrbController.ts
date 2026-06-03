'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  instantBanDebug,
  instantBanPayoffPhaseDebug,
  instantBanPayoffStartDebug,
} from '@/lib/instant-ban-debug';

const HOLD_MS = 650;
const RELEASE_IMPACT_MS = 250;
const PAYOFF_MORPH_MS = 4000;
const PAYOFF_SETTLE_MS = 450;
const REVEAL_STAGGER_MS = 100;
const REVEAL_ITEM_MS = 280;
const CTA_EXTRA_DELAY_MS = 120;
/** Stage 1: lobby ring shrinks toward mini-core (ring layer only). */
export const CONFIRM_COMPRESS_SHRINK_MS = 300;
/** Stage 2: hold dense ring around 98+. */
export const CONFIRM_COMPRESS_MINI_HOLD_MS = 250;
/** Stage 3: spring expand ring + wrap to confirm size. */
export const CONFIRM_COMPRESS_EXPAND_MS = 350;
export const CONFIRM_ENTER_COMPRESS_MS =
  CONFIRM_COMPRESS_SHRINK_MS +
  CONFIRM_COMPRESS_MINI_HOLD_MS +
  CONFIRM_COMPRESS_EXPAND_MS;
/** Keep lobby-sized orb visible after compose exits before compress starts. */
export const CONFIRM_COMPRESS_HOLD_MS = 180;

export type HoldPhase = 'idle' | 'holding' | 'ready' | 'releasing';
export type EnterPhase =
  | 'lobby-orb'
  | 'compressing'
  | 'mini-core'
  | 'expanding'
  | 'ready';
export type PayoffPhase =
  | 'none'
  | 'impact'
  | 'morph'
  | 'settle'
  | 'reveal'
  | 'cta'
  | 'ready';

const PAYOFF_CARD_LOCKED_PHASES: PayoffPhase[] = ['settle', 'reveal', 'cta', 'ready'];

function clampInfluencePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(0, value));
}

function lockPayoffCardGeometry(el: HTMLButtonElement): void {
  el.classList.remove('instant-ban-confirm-orb-btn--payoff-geometry-run');
  el.classList.add('instant-ban-confirm-orb-btn--payoff-card-locked');
  el.style.left = '50%';
  el.style.top = '50%';
  el.style.width = 'var(--98-payoff-card-width)';
  el.style.height = 'var(--98-payoff-card-height)';
  el.style.borderRadius = 'var(--98-payoff-card-radius)';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.clipPath = 'none';
  el.style.mask = 'none';
}

function clearPayoffShellStyles(el: HTMLButtonElement | null): void {
  if (!el) return;
  el.classList.remove(
    'instant-ban-confirm-orb-btn--payoff-geometry-run',
    'instant-ban-confirm-orb-btn--payoff-card-locked',
  );
  el.style.removeProperty('left');
  el.style.removeProperty('top');
  el.style.removeProperty('width');
  el.style.removeProperty('height');
  el.style.removeProperty('border-radius');
  el.style.removeProperty('transform');
  el.style.removeProperty('clip-path');
  el.style.removeProperty('mask');
  el.style.removeProperty('--payoff-x0');
  el.style.removeProperty('--payoff-y0');
  el.style.removeProperty('--payoff-w0');
  el.style.removeProperty('--payoff-h0');
}

export type ConfirmOrbControllerOptions = {
  /** Hold/send/payoff — after compose exit completes. */
  active: boolean;
  /** Ring compress + enter timeline — starts with compose exit. */
  compressActive: boolean;
  enterKey: number;
  influencePercent: number;
  sending: boolean;
  error: string | null;
  payoffArmToken: number;
  orbWrapRef: RefObject<HTMLDivElement | null>;
  onConfirm: () => void;
  onSendContextChange: (ctx: {
    payoffPhase: string;
    sendTriggered: boolean;
  }) => void;
  onBindAbortRelease: (abort: () => void) => void;
};

export function useConfirmOrbController({
  active,
  compressActive,
  enterKey,
  influencePercent,
  sending,
  error,
  payoffArmToken,
  orbWrapRef,
  onConfirm,
  onSendContextChange,
  onBindAbortRelease,
}: ConfirmOrbControllerOptions) {
  const influenceStart = useMemo(
    () => clampInfluencePercent(influencePercent),
    [influencePercent],
  );

  const [enterPhase, setEnterPhase] = useState<EnterPhase>('lobby-orb');
  const [ringProgress, setRingProgress] = useState(influenceStart);
  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const [payoffPhase, setPayoffPhase] = useState<PayoffPhase>('none');
  const [bounce, setBounce] = useState(false);

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

  const enterComplete = enterPhase === 'ready';
  const payoffActive = payoffPhase !== 'none';

  const setHoldPhaseState = useCallback((phase: HoldPhase) => {
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
    setHoldPhaseState('idle');
    setPayoff('none');
    clearPayoffShellStyles(orbBtnRef.current);
  }, [setHoldPhaseState, setPayoff]);

  const resetPayoff = useCallback(() => {
    clearPayoffTimer();
    payoffPendingRef.current = false;
    setPayoff('none');
    setHoldPhaseState('idle');
    sendTriggeredRef.current = false;
    clearPayoffShellStyles(orbBtnRef.current);
  }, [clearPayoffTimer, setHoldPhaseState, setPayoff]);

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
        setHoldPhaseState('idle');
        if (withWarning) {
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
            ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
          } catch {
            /* noop */
          }
          triggerBounce();
        }
      }
    },
    [clearHoldTimer, payoffActive, setHoldPhaseState, triggerBounce],
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
    if (compressActive || active) return;

    setEnterPhase('lobby-orb');
    setHoldPhaseState('idle');
    setPayoff('none');
    setRingProgress(influenceStart);
    sendTriggeredRef.current = false;
    payoffPendingRef.current = false;
    clearPayoffShellStyles(orbBtnRef.current);
  }, [active, compressActive, influenceStart, setHoldPhaseState, setPayoff]);

  useEffect(() => {
    if (!compressActive) return;

    setRingProgress(influenceStart);
    sendTriggeredRef.current = false;
    payoffPendingRef.current = false;
    payoffArmSeenRef.current = 0;
    setPayoff('none');
    clearPayoffTimer();

    setEnterPhase('compressing');
    const readyTimer = window.setTimeout(() => {
      setEnterPhase('ready');
    }, CONFIRM_ENTER_COMPRESS_MS);

    return () => {
      window.clearTimeout(readyTimer);
    };
  }, [
    compressActive,
    enterKey,
    influenceStart,
    clearPayoffTimer,
    setPayoff,
  ]);

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
    instantBanPayoffStartDebug({
      payoffArmToken,
      phase: 'impact',
    });
    setPayoff('impact');
  }, [payoffArmToken, setPayoff]);

  useEffect(() => {
    if (error && payoffPhase === 'none') {
      resetPayoff();
    }
  }, [error, payoffPhase, resetPayoff]);

  useLayoutEffect(() => {
    const mount = orbWrapRef.current;
    if (!mount) return;

    if (compressActive || active) {
      mount.setAttribute('data-enter-phase', enterPhase);
      mount.setAttribute('data-payoff-phase', payoffPhase);
      mount.setAttribute('data-confirm-enter-key', String(enterKey));
    } else {
      mount.removeAttribute('data-enter-phase');
      mount.removeAttribute('data-payoff-phase');
      mount.removeAttribute('data-confirm-enter-key');
      mount.removeAttribute('data-ring-enter-active');
    }
  }, [active, compressActive, orbWrapRef, enterPhase, payoffPhase, enterKey]);

  /** One continuous ring animation — enterPhase changes must not restart ring CSS. */
  useLayoutEffect(() => {
    const mount = orbWrapRef.current;
    if (!mount) return;

    if (!compressActive) {
      mount.removeAttribute('data-ring-enter-active');
      return;
    }

    mount.removeAttribute('data-ring-enter-active');
    void mount.offsetWidth;
    mount.setAttribute('data-ring-enter-active', '');
  }, [compressActive, enterKey, orbWrapRef]);

  useEffect(() => {
    if (
      !compressActive ||
      (enterPhase !== 'compressing' && enterPhase !== 'mini-core')
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setRingProgress(100);
    });
    return () => cancelAnimationFrame(frame);
  }, [compressActive, enterPhase]);

  useLayoutEffect(() => {
    const btn = orbBtnRef.current;
    if (!btn || payoffPhase !== 'morph') return;

    btn.classList.remove('instant-ban-confirm-orb-btn--payoff-geometry-run');

    const rect = btn.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    btn.style.setProperty('--payoff-x0', `${startX}px`);
    btn.style.setProperty('--payoff-y0', `${startY}px`);
    btn.style.setProperty('--payoff-w0', `${rect.width}px`);
    btn.style.setProperty('--payoff-h0', `${rect.height}px`);
    btn.style.left = `${startX}px`;
    btn.style.top = `${startY}px`;
    btn.style.width = `${rect.width}px`;
    btn.style.height = `${rect.height}px`;
    btn.style.borderRadius = '50%';
    btn.style.transform = 'translate(-50%, -50%)';

    void btn.offsetHeight;

    const frame = requestAnimationFrame(() => {
      btn.classList.add('instant-ban-confirm-orb-btn--payoff-geometry-run');
    });

    return () => cancelAnimationFrame(frame);
  }, [payoffPhase]);

  useLayoutEffect(() => {
    const btn = orbBtnRef.current;
    if (!btn) return;
    if (PAYOFF_CARD_LOCKED_PHASES.includes(payoffPhase)) {
      lockPayoffCardGeometry(btn);
    }
    instantBanPayoffPhaseDebug(payoffPhase, btn.className, btn);
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
    schedulePayoff(REVEAL_ITEM_MS + REVEAL_STAGGER_MS * 4, 'cta');
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
    (e: PointerEvent<HTMLButtonElement>) => {
      if (
        !active ||
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
      setHoldPhaseState('holding');
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        if (holdPhaseRef.current !== 'holding') return;
        readyToReleaseRef.current = true;
        setHoldPhaseState('ready');
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
          ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        } catch {
          /* noop */
        }
      }, HOLD_MS);
    },
    [active, enterComplete, sending, payoffActive, clearHoldTimer, setHoldPhaseState],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (
        !active ||
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
        setHoldPhaseState('releasing');
        onConfirm();
        return;
      }

      if (
        holdPhaseRef.current === 'holding' ||
        holdPhaseRef.current === 'ready'
      ) {
        readyToReleaseRef.current = false;
        setHoldPhaseState('idle');
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
          ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
        } catch {
          /* noop */
        }
        triggerBounce();
      }
    },
    [
      active,
      enterComplete,
      sending,
      payoffActive,
      clearHoldTimer,
      setHoldPhaseState,
      onConfirm,
      cancelHold,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (!active || !enterComplete || sending || sendTriggeredRef.current || payoffActive) {
      return;
    }
    cancelHold(true);
  }, [active, enterComplete, sending, payoffActive, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    if (!active || !enterComplete || sending || sendTriggeredRef.current || payoffActive) {
      return;
    }
    if (holdPhaseRef.current === 'idle' || holdPhaseRef.current === 'releasing') {
      return;
    }
    cancelHold(true);
  }, [active, enterComplete, sending, payoffActive, cancelHold]);

  const orbBtnClass = [
    'instant-ban-arena-lobby-orb__btn',
    'instant-ban-confirm-orb-btn',
    active ? 'instant-ban-arena-lobby-orb__btn--confirm' : '',
    holdPhase === 'holding' ? 'instant-ban-confirm-orb-btn--holding' : '',
    holdPhase === 'ready' ? 'instant-ban-confirm-orb-btn--ready' : '',
    holdPhase === 'releasing' ? 'instant-ban-confirm-orb-btn--releasing' : '',
    bounce ? 'instant-ban-confirm-orb-btn--bounce' : '',
    payoffPhase === 'impact' ? 'instant-ban-confirm-orb-btn--payoff-impact' : '',
    payoffPhase === 'morph' ? 'instant-ban-confirm-orb-btn--payoff-geometry' : '',
    payoffPhase === 'settle' ? 'instant-ban-confirm-orb-btn--payoff-settle' : '',
    PAYOFF_CARD_LOCKED_PHASES.includes(payoffPhase)
      ? 'instant-ban-confirm-orb-btn--payoff-card-locked'
      : '',
    PAYOFF_CARD_LOCKED_PHASES.includes(payoffPhase)
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
    payoffPhase === 'none' || payoffPhase === 'impact' || payoffPhase === 'morph';

  const ringValue = compressActive ? ringProgress : influenceStart;

  return {
    orbBtnRef,
    orbBtnClass,
    enterPhase,
    payoffPhase,
    payoffActive,
    enterComplete,
    holdPhase,
    ringValue,
    showOrbFace,
    showPayoffContent,
    showPayoffCta,
    statusLabel,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    buttonDisabled:
      (sending && !payoffActive) ||
      (active && !enterComplete && !payoffActive) ||
      (payoffActive && payoffPhase !== 'ready'),
  };
}
