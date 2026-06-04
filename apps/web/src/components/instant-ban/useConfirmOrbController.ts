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
const HOLD_MS = 650;
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

/** Payoff morph removed — kept for ConfirmScreen data attr compatibility. */
export type PayoffPhase = 'none';

function clampInfluencePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(0, value));
}

export type ConfirmOrbControllerOptions = {
  /** Hold/send — after compose exit completes. */
  active: boolean;
  /** Ring compress + enter timeline — starts with compose exit. */
  compressActive: boolean;
  enterKey: number;
  influencePercent: number;
  sending: boolean;
  error: string | null;
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
  const [bounce, setBounce] = useState(false);

  const orbBtnRef = useRef<HTMLButtonElement>(null);
  const holdPhaseRef = useRef<HoldPhase>('idle');
  const readyToReleaseRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTriggeredRef = useRef(false);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterComplete = enterPhase === 'ready';

  const setHoldPhaseState = useCallback((phase: HoldPhase) => {
    holdPhaseRef.current = phase;
    setHoldPhase(phase);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const abortRelease = useCallback(() => {
    sendTriggeredRef.current = false;
    readyToReleaseRef.current = false;
    setHoldPhaseState('idle');
  }, [setHoldPhaseState]);

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
    [clearHoldTimer, setHoldPhaseState, triggerBounce],
  );

  useEffect(() => {
    onBindAbortRelease(abortRelease);
  }, [onBindAbortRelease, abortRelease]);

  useEffect(() => {
    onSendContextChange({
      payoffPhase: 'none',
      sendTriggered: sendTriggeredRef.current,
    });
  });

  useEffect(() => {
    if (compressActive || active) return;

    setEnterPhase('lobby-orb');
    setHoldPhaseState('idle');
    setRingProgress(influenceStart);
    sendTriggeredRef.current = false;
  }, [active, compressActive, influenceStart, setHoldPhaseState]);

  useEffect(() => {
    if (!compressActive) return;

    setRingProgress(influenceStart);
    sendTriggeredRef.current = false;

    setEnterPhase('compressing');
    const readyTimer = window.setTimeout(() => {
      setEnterPhase('ready');
    }, CONFIRM_ENTER_COMPRESS_MS);

    return () => {
      window.clearTimeout(readyTimer);
    };
  }, [compressActive, enterKey, influenceStart]);

  useLayoutEffect(() => {
    const mount = orbWrapRef.current;
    if (!mount) return;

    if (compressActive || active) {
      mount.setAttribute('data-enter-phase', enterPhase);
      mount.setAttribute('data-payoff-phase', 'none');
      mount.setAttribute('data-confirm-enter-key', String(enterKey));
    } else {
      mount.removeAttribute('data-enter-phase');
      mount.removeAttribute('data-payoff-phase');
      mount.removeAttribute('data-confirm-enter-key');
      mount.removeAttribute('data-ring-enter-active');
    }
  }, [active, compressActive, orbWrapRef, enterPhase, enterKey]);

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
    if (error) {
      sendTriggeredRef.current = false;
      setHoldPhaseState('idle');
    }
  }, [error, setHoldPhaseState]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
      }
    };
  }, [clearHoldTimer]);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (
        !active ||
        !enterComplete ||
        sending ||
        sendTriggeredRef.current ||
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
    [active, enterComplete, sending, clearHoldTimer, setHoldPhaseState],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!active || !enterComplete || sending || sendTriggeredRef.current) {
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
      clearHoldTimer,
      setHoldPhaseState,
      onConfirm,
      triggerBounce,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (!active || !enterComplete || sending || sendTriggeredRef.current) {
      return;
    }
    cancelHold(true);
  }, [active, enterComplete, sending, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    if (!active || !enterComplete || sending || sendTriggeredRef.current) {
      return;
    }
    if (holdPhaseRef.current === 'idle' || holdPhaseRef.current === 'releasing') {
      return;
    }
    cancelHold(true);
  }, [active, enterComplete, sending, cancelHold]);

  const orbBtnClass = [
    'instant-ban-arena-lobby-orb__btn',
    'instant-ban-confirm-orb-btn',
    active ? 'instant-ban-arena-lobby-orb__btn--confirm' : '',
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

  const ringValue = compressActive ? ringProgress : influenceStart;

  return {
    orbBtnRef,
    orbBtnClass,
    enterPhase,
    payoffPhase: 'none' as const,
    payoffActive: false,
    enterComplete,
    holdPhase,
    ringValue,
    showOrbFace: true,
    showPayoffContent: false,
    showPayoffCta: false,
    statusLabel,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    buttonDisabled:
      sending || (active && !enterComplete),
  };
}
