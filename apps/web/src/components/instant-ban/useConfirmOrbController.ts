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
/** Must match payoff ritual vars in 98-theme.css */
const PAYOFF_COLLAPSE_MS = 560;
const PAYOFF_CORE_MS = 220;
const PAYOFF_REBIRTH_MS = 680;
const PAYOFF_GROW_MS = 820;
const PAYOFF_SETTLE_MS = 450;
const REVEAL_STAGGER_MS = 100;
const REVEAL_ITEM_MS = 280;
const CTA_EXTRA_DELAY_MS = 120;
/** Stage 1: lobby ring shrinks toward mini-core (ring layer only). */
export const CONFIRM_COMPRESS_SHRINK_MS = 420;
/** Stage 2: brief hold dense ring around 98+. */
export const CONFIRM_COMPRESS_MINI_HOLD_MS = 80;
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
  | 'collapse'
  | 'core'
  | 'rebirth'
  | 'grow'
  | 'settle'
  | 'reveal'
  | 'cta'
  | 'ready';

const PAYOFF_CARD_LOCKED_PHASES: PayoffPhase[] = ['settle', 'reveal', 'cta', 'ready'];

const PAYOFF_ANIM_RUN_CLASS: Partial<Record<PayoffPhase, string>> = {
  collapse: 'instant-ban-confirm-orb-btn--payoff-collapse-run',
  rebirth: 'instant-ban-confirm-orb-btn--payoff-rebirth-run',
  grow: 'instant-ban-confirm-orb-btn--payoff-grow-run',
};

function clampInfluencePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(0, value));
}

function lockPayoffCardGeometry(el: HTMLButtonElement): void {
  Object.values(PAYOFF_ANIM_RUN_CLASS).forEach((cls) => {
    if (cls) el.classList.remove(cls);
  });
  el.classList.add('instant-ban-confirm-orb-btn--payoff-card-locked');
}

function clearPayoffShellStyles(el: HTMLButtonElement | null): void {
  if (!el) return;
  Object.values(PAYOFF_ANIM_RUN_CLASS).forEach((cls) => {
    if (cls) el.classList.remove(cls);
  });
  el.classList.remove('instant-ban-confirm-orb-btn--payoff-card-locked');
}

function restartPayoffAnimRun(btn: HTMLButtonElement, phase: PayoffPhase): void {
  const runClass = PAYOFF_ANIM_RUN_CLASS[phase];
  if (!runClass) return;
  btn.classList.remove(runClass);
  void btn.offsetWidth;
  btn.classList.add(runClass);
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
    setHoldPhaseState('idle');
    instantBanPayoffStartDebug({
      payoffArmToken,
      phase: 'collapse',
    });
    setPayoff('collapse');
  }, [payoffArmToken, setHoldPhaseState, setPayoff]);

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

  useEffect(() => {
    const btn = orbBtnRef.current;
    if (!btn || !(payoffPhase in PAYOFF_ANIM_RUN_CLASS)) return;
    restartPayoffAnimRun(btn, payoffPhase);
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
    if (payoffPhase !== 'collapse') return;
    schedulePayoff(PAYOFF_COLLAPSE_MS, 'core');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'core') return;
    schedulePayoff(PAYOFF_CORE_MS, 'rebirth');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'rebirth') return;
    schedulePayoff(PAYOFF_REBIRTH_MS, 'grow');
  }, [payoffPhase, schedulePayoff]);

  useEffect(() => {
    if (payoffPhase !== 'grow') return;
    schedulePayoff(PAYOFF_GROW_MS, 'settle');
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
    payoffPhase === 'collapse' ? 'instant-ban-confirm-orb-btn--payoff-collapse' : '',
    payoffPhase === 'core' ? 'instant-ban-confirm-orb-btn--payoff-core' : '',
    payoffPhase === 'rebirth' ? 'instant-ban-confirm-orb-btn--payoff-rebirth' : '',
    payoffPhase === 'grow' ? 'instant-ban-confirm-orb-btn--payoff-grow' : '',
    payoffPhase === 'settle' ? 'instant-ban-confirm-orb-btn--payoff-settle' : '',
    PAYOFF_CARD_LOCKED_PHASES.includes(payoffPhase)
      ? 'instant-ban-confirm-orb-btn--payoff-card-locked'
      : '',
    payoffPhase === 'reveal' || payoffPhase === 'cta' || payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-reveal'
      : '',
    payoffPhase === 'cta' || payoffPhase === 'ready'
      ? 'instant-ban-confirm-orb-btn--payoff-cta'
      : '',
    payoffPhase === 'ready' ? 'instant-ban-confirm-orb-btn--payoff-ready' : '',
    payoffPhase === 'collapse' ||
    payoffPhase === 'core' ||
    payoffPhase === 'rebirth' ||
    payoffPhase === 'grow' ||
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
  const showOrbFace = payoffPhase === 'none' || payoffPhase === 'collapse';

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
