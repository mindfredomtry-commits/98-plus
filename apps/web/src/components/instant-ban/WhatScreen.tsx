'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react';
import {
  COMPOSE_RECIPIENT_MODES,
  type ComposeRecipientMode,
  type FriendCard,
} from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { instantBanDebug } from '@/lib/instant-ban-debug';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from './WhatBackIcon';
import {
  WhatDurationSlider,
  clampWhatDurationMinutes,
} from './WhatDurationSlider';
import { shouldDeferWhatScreenGesture } from './gestureExclusion';
import {
  describeHitTarget,
  inspectHitTarget,
  isWhatHitDebugEnabled,
  isWhatTouchDiagEnabled,
  logBanInput,
  logComposeGesture,
  logDocumentHitTest,
  logPresetChip,
  logWhatBack,
  logWhatHit,
} from './whatScreenTouchDiag';

const QUICK_CHIPS = [
  'сидеть в TikTok',
  'писать бывшему',
  'играть',
  'есть ночью',
  'пить энергетики',
  'лежать до обеда',
] as const;

const CHIP_PREFIX = 'Запрещаю ';

const PLACEHOLDER_CYCLE_PHRASES = [
  'Запрети снова это делать...',
  'Запретить это уже давно пора...',
  'Запрети то, что давно хочешь...',
  'Запрети то, что тебя раздражает...',
] as const;

const PLACEHOLDER_CYCLE_MS = 3000;
const PLACEHOLDER_FADE_MS = 250;

const DEFAULT_DURATION = 3;

/** Scroll driver must exceed viewport by at least this much. */
const SCROLL_DRIVER_MIN_OVERFLOW_PX = 120;
/** Raw scroll fraction that maps to exit progress 1 (non-compose scroll mode). */
const COMPOSE_EXIT_SCROLL_COMPLETE = 0.48;
/** Finger travel (px) for compose exit progress 0 → 1 (lower swipe zone only). */
const COMPOSE_EXIT_TRAVEL_PX = 300;
/** Release past this progress → complete What → Confirm (title ~top ≈ 0.5–0.55). */
const SNAP_EXIT_THRESHOLD = 0.44;
/** Upward progress velocity (1/s) that also commits exit on release. */
const SNAP_EXIT_VELOCITY = 0.22;
/** Debounce before evaluating snap after scroll stops. */
const SCROLL_SETTLE_MS = 48;
/** Full compose-layer exit animation. */
const COMPOSE_EXIT_MS = 240;
/** Snap-back when release below threshold. */
const COMPOSE_RESET_MS = 160;
const WHAT_TRANSITION_DIAG =
  process.env.NEXT_PUBLIC_WHAT_TRANSITION_DIAG === '1';

function logWhatTransition(
  event:
    | 'WHAT_RENDER_STATE'
    | 'WHAT_GESTURE_START'
    | 'WHAT_GESTURE_PROGRESS'
    | 'WHAT_GESTURE_COMMIT'
    | 'WHAT_CONFIRM_GUARD'
    | 'WHAT_CONFIRM_TRANSITION_REQUESTED',
  fields: Record<string, unknown>,
): void {
  if (!WHAT_TRANSITION_DIAG) return;
  console.info(event, fields);
}

const WhatSwipeTapZone = memo(function WhatSwipeTapZone({
  onTap,
}: {
  onTap: () => void;
}) {
  return (
    <div
      className="instant-ban-what-swipe-zone"
      data-no-horizontal-pager=""
      role="presentation"
      aria-hidden
      onClick={onTap}
    >
      <div className="instant-ban-what-scroll-lift-hint" aria-hidden>
        <div className="instant-ban-what-scroll-lift-hint__stage">
          <div className="instant-ban-what-scroll-lift-hint__mover">
            <div className="instant-ban-what-scroll-lift-hint__shape">
              <div className="instant-ban-what-scroll-lift-hint__trail" />
              <div className="instant-ban-what-scroll-lift-hint__circle-shell" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

function fullTextFromChip(chip: string): string {
  return `${CHIP_PREFIX}${chip}`;
}

function chipFromFullText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(CHIP_PREFIX)) return null;
  const rest = trimmed.slice(CHIP_PREFIX.length);
  return (QUICK_CHIPS as readonly string[]).includes(rest) ? rest : null;
}

type Props = {
  recipientMode: ComposeRecipientMode;
  selectedUser: FriendCard | null;
  initialBanText?: string;
  initialDurationMinutes?: number;
  /** Unified compose scene title (inside swipe layer). */
  overlayTitle?: string;
  /** 0–1 while compose layer dismisses (overlay fade). */
  onComposeExitProgress?: (progress: number) => void;
  /** Fired when swipe exit animation starts (orb compress begins here). */
  onComposeExitStart?: () => void;
  onSubmit: (text: string, durationMinutes: number) => void;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const WhatSelectedUser = memo(function WhatSelectedUser({
  recipientMode,
  user,
}: {
  recipientMode: ComposeRecipientMode;
  user: FriendCard | null;
}) {
  if (recipientMode === COMPOSE_RECIPIENT_MODES.KNOWN_BY_SENDER) {
    return (
      <div
        className="instant-ban-what-selected instant-ban-what-selected--mobile"
        data-recipient-mode={recipientMode}
      >
        <AvatarImage
          src={null}
          letter=""
          sizeClass="w-11 h-11"
          textClass="text-base"
        />
        <div className="instant-ban-what-selected__name">
          ты уже знаешь кто это
        </div>
      </div>
    );
  }

  if (!user) return null;
  const letter = (
    user.firstName?.[0] ?? user.username?.[0] ?? '?'
  ).toUpperCase();

  return (
    <div className="instant-ban-what-selected instant-ban-what-selected--mobile">
      <AvatarImage
        src={friendAvatarUrl(user)}
        letter={letter}
        sizeClass="w-11 h-11"
        textClass="text-base"
      />
      <div className="instant-ban-what-selected__name">{friendLabel(user)}</div>
    </div>
  );
});

function WhatScreenInner({
  recipientMode,
  selectedUser,
  initialBanText = '',
  initialDurationMinutes = DEFAULT_DURATION,
  overlayTitle,
  onComposeExitProgress,
  onComposeExitStart,
  onSubmit,
  onBack,
}: Props) {
  const instanceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canContinueRafRef = useRef<number | null>(null);

  const [canContinue, setCanContinue] = useState(
    initialBanText.trim().length >= 3,
  );
  const [canSwipeToConfirm, setCanSwipeToConfirm] = useState(
    initialBanText.trim().length > 0,
  );
  const [durationMinutes, setDurationMinutes] = useState(() =>
    clampWhatDurationMinutes(initialDurationMinutes),
  );
  const [selectedChip, setSelectedChip] = useState<string | null>(() =>
    chipFromFullText(initialBanText),
  );
  const [isEmpty, setIsEmpty] = useState(initialBanText.length === 0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);

  const isComposeScene = Boolean(overlayTitle);
  const directRecipientId =
    selectedUser?.userId ?? selectedUser?.id ?? null;
  const recipientValid =
    recipientMode === COMPOSE_RECIPIENT_MODES.KNOWN_BY_SENDER ||
    selectedUser != null;

  const [exitProgress, setExitProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!isEmpty) return;

    setPhraseIndex(0);
    setPhraseVisible(true);

    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;
    const intervalId = window.setInterval(() => {
      setPhraseVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % PLACEHOLDER_CYCLE_PHRASES.length);
        setPhraseVisible(true);
      }, PLACEHOLDER_FADE_MS);
    }, PLACEHOLDER_CYCLE_MS);

    return () => {
      window.clearInterval(intervalId);
      if (fadeTimeout) window.clearTimeout(fadeTimeout);
    };
  }, [isEmpty]);

  useEffect(() => {
    instantBanDebug('what-mount', { instanceId, mode: 'mobile-safe-input' });
    return () => {
      instantBanDebug('what-unmount', { instanceId });
      if (canContinueRafRef.current != null) {
        cancelAnimationFrame(canContinueRafRef.current);
      }
    };
  }, [instanceId]);

  const scheduleCanContinueSync = useCallback(() => {
    if (canContinueRafRef.current != null) return;
    canContinueRafRef.current = requestAnimationFrame(() => {
      canContinueRafRef.current = null;
      const value = inputRef.current?.value ?? '';
      const trimmedLen = value.trim().length;
      const nextContinue = trimmedLen >= 3;
      const nextSwipe = trimmedLen > 0;
      setCanContinue((prev) => (prev === nextContinue ? prev : nextContinue));
      setCanSwipeToConfirm((prev) => (prev === nextSwipe ? prev : nextSwipe));
    });
  }, []);

  const handleInput = useCallback(() => {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : 0;
    const value = inputRef.current?.value ?? '';
    const empty = value.length === 0;
    setIsEmpty((prev) => (prev === empty ? prev : empty));
    const matched = chipFromFullText(value);
    setSelectedChip((prev) => (prev === matched ? prev : matched));
    scheduleCanContinueSync();
    if (process.env.NODE_ENV === 'development' && t0) {
      requestAnimationFrame(() => {
        instantBanDebug('onInput', {
          ms: Math.round((performance.now() - t0) * 100) / 100,
          len: value.length,
        });
      });
    }
  }, [scheduleCanContinueSync]);

  const handleFocus = useCallback(() => {
    logBanInput('focus');
    instantBanDebug('input-focus', { instanceId });
  }, [instanceId]);

  const handleBlur = useCallback(() => {
    logBanInput('blur');
    instantBanDebug('input-blur', { instanceId });
  }, [instanceId]);

  const handleBackNavigate = useCallback(() => {
    logWhatHit('back', { source: 'click' });
    logWhatBack('click');
    logWhatBack('navigate-who');
    onBack();
  }, [onBack]);

  const applyChip = useCallback(
    (chip: string) => {
      if (inputRef.current) {
        inputRef.current.value = fullTextFromChip(chip);
      }
      setIsEmpty(false);
      setSelectedChip(chip);
      setCanSwipeToConfirm(true);
      scheduleCanContinueSync();
    },
    [scheduleCanContinueSync],
  );

  const chipTouchStartRef = useRef<{
    chip: string;
    x: number;
    y: number;
  } | null>(null);
  const chipTouchActivatedRef = useRef<string | null>(null);

  const diagChip = useCallback((chip: string, event: string) => {
    logPresetChip(event, chip);
  }, []);

  const activatePresetChip = useCallback(
    (chip: string, source: string) => {
      applyChip(chip);
      logPresetChip('selected', chip, { source });
      chipTouchActivatedRef.current = chip;
      window.requestAnimationFrame(() => {
        if (chipTouchActivatedRef.current === chip) {
          chipTouchActivatedRef.current = null;
        }
      });
    },
    [applyChip],
  );

  const handlePresetChipPointerDown = useCallback(
    (chip: string) => {
      logWhatHit('chip', { source: 'pointerdown', label: chip });
      diagChip(chip, 'pointerdown');
    },
    [diagChip],
  );

  const handlePresetChipPointerUp = useCallback(
    (chip: string) => {
      diagChip(chip, 'pointerup');
    },
    [diagChip],
  );

  const handlePresetChipClick = useCallback(
    (chip: string) => {
      logWhatHit('chip', { source: 'click', label: chip });
      diagChip(chip, 'click');
      if (chipTouchActivatedRef.current === chip) return;
      activatePresetChip(chip, 'click');
    },
    [activatePresetChip, diagChip],
  );

  const handlePresetChipTouchStart = useCallback(
    (chip: string, e: TouchEvent<HTMLButtonElement>) => {
      const touch = e.touches[0];
      logWhatHit('chip', { source: 'touchstart', label: chip });
      diagChip(chip, 'touchstart');
      if (touch && isWhatTouchDiagEnabled()) {
        logDocumentHitTest('chip-touchstart', touch.clientX, touch.clientY, {
          label: chip,
          defaultPrevented: e.defaultPrevented,
        });
      }
      if (!touch) return;
      chipTouchStartRef.current = {
        chip,
        x: touch.clientX,
        y: touch.clientY,
      };
    },
    [diagChip],
  );

  const handlePresetChipTouchEnd = useCallback(
    (chip: string, e: TouchEvent<HTMLButtonElement>) => {
      diagChip(chip, 'touchend');
      const start = chipTouchStartRef.current;
      chipTouchStartRef.current = null;
      if (!start || start.chip !== chip) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 14 || dy > 14) return;
      if (chipTouchActivatedRef.current === chip) return;
      activatePresetChip(chip, 'touchend');
    },
    [activatePresetChip, diagChip],
  );

  useEffect(() => {
    if (!isWhatTouchDiagEnabled() && !isWhatHitDebugEnabled()) return;

    const onDocTouchStartCapture = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (isWhatTouchDiagEnabled()) {
        logDocumentHitTest('touchstart-capture', touch.clientX, touch.clientY, {
          defaultPrevented: e.defaultPrevented,
          eventTarget:
            e.target instanceof Element ? e.target.tagName : String(e.target),
        });
      }

      if (!isWhatHitDebugEnabled()) return;

      const whatRoot = document.querySelector(
        '[data-instant-ban-view="WhatScreen"]',
      );
      if (!(whatRoot instanceof Element)) return;
      const rect = whatRoot.getBoundingClientRect();
      if (
        touch.clientX < rect.left ||
        touch.clientX > rect.right ||
        touch.clientY < rect.top ||
        touch.clientY > rect.bottom
      ) {
        return;
      }

      const hit = inspectHitTarget(touch.clientX, touch.clientY);
      const onInteractive =
        e.target instanceof Element &&
        (e.target.closest('[data-gesture-exclude]') != null ||
          e.target.closest('[data-what-interactive]') != null);

      console.log('WHAT TOUCH CAPTURE', {
        x: touch.clientX,
        y: touch.clientY,
        onInteractive,
        eventTarget:
          e.target instanceof Element
            ? `${e.target.tagName}.${e.target.className}`
            : String(e.target),
        elementFromPoint: hit,
      });
    };

    document.addEventListener('touchstart', onDocTouchStartCapture, true);
    return () => {
      document.removeEventListener('touchstart', onDocTouchStartCapture, true);
    };
  }, []);

  const handleSubmit = useCallback(() => {
    const text = (inputRef.current?.value ?? '').trim();
    const textValid = text.length >= 3;
    const valid = textValid && recipientValid && durationMinutes > 0;
    logWhatTransition('WHAT_CONFIRM_GUARD', {
      recipientMode,
      directRecipientId,
      textLength: text.length,
      textValid,
      recipientValid,
      durationValid: durationMinutes > 0,
      validationResult: valid,
      blockingReason: !recipientValid
        ? 'invalid-recipient'
        : !textValid
          ? 'text-too-short'
          : durationMinutes <= 0
            ? 'invalid-duration'
            : null,
      currentScreen: 'WHAT',
      targetScreen: 'CONFIRM',
    });
    if (!valid) return;
    logWhatTransition('WHAT_CONFIRM_TRANSITION_REQUESTED', {
      recipientMode,
      directRecipientId,
      textLength: text.length,
      validationResult: true,
      blockingReason: null,
      currentScreen: 'WHAT',
      targetScreen: 'CONFIRM',
    });
    onSubmit(text, durationMinutes);
  }, [
    directRecipientId,
    durationMinutes,
    onSubmit,
    recipientMode,
    recipientValid,
  ]);

  const showSwipeHint =
    canSwipeToConfirm && recipientValid && durationMinutes > 0;

  useEffect(() => {
    logWhatTransition('WHAT_RENDER_STATE', {
      recipientMode,
      directRecipientId,
      textLength: inputRef.current?.value.trim().length ?? 0,
      textValid: canContinue,
      recipientValid,
      validationResult: canContinue && recipientValid && durationMinutes > 0,
      blockingReason: !recipientValid
        ? 'invalid-recipient'
        : !canContinue
          ? 'text-too-short'
          : durationMinutes <= 0
            ? 'invalid-duration'
            : null,
      showSwipeHint,
      currentScreen: 'WHAT',
      targetScreen: 'CONFIRM',
    });
  }, [
    canContinue,
    directRecipientId,
    durationMinutes,
    recipientMode,
    recipientValid,
    showSwipeHint,
  ]);

  const canContinueRef = useRef(canContinue);
  const canSwipeToConfirmRef = useRef(canSwipeToConfirm);
  const exitProgressRef = useRef(0);
  const isExitingRef = useRef(false);
  const isResettingRef = useRef(false);
  const exitVelocityRef = useRef(0);
  const progressSampleRef = useRef({ progress: 0, time: 0 });
  const snapSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGestureActiveRef = useRef(false);

  useEffect(() => {
    canContinueRef.current = canContinue;
  }, [canContinue]);

  useEffect(() => {
    canSwipeToConfirmRef.current = canSwipeToConfirm;
  }, [canSwipeToConfirm]);

  useEffect(() => {
    exitProgressRef.current = exitProgress;
  }, [exitProgress]);

  useEffect(() => {
    isExitingRef.current = isExiting;
  }, [isExiting]);

  useEffect(() => {
    isResettingRef.current = isResetting;
  }, [isResetting]);

  useEffect(() => {
    if (!isComposeScene) return;
    onComposeExitProgress?.(exitProgress);
  }, [exitProgress, isComposeScene, onComposeExitProgress]);

  useEffect(() => {
    if (!isComposeScene) return;
    return () => {
      onComposeExitProgress?.(0);
    };
  }, [isComposeScene, onComposeExitProgress]);

  const isScrollReady = useCallback(() => {
    const textOk = (inputRef.current?.value ?? '').trim().length >= 3;
    return (
      canContinueRef.current &&
      textOk &&
      recipientValid &&
      durationMinutes > 0
    );
  }, [durationMinutes, recipientValid]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const exitAnimRef = useRef<number | null>(null);
  const exitCommitRef = useRef(false);

  const clearExitAnim = useCallback(() => {
    if (exitAnimRef.current != null) {
      cancelAnimationFrame(exitAnimRef.current);
      exitAnimRef.current = null;
    }
  }, []);

  const clearSnapSettleTimer = useCallback(() => {
    if (snapSettleTimerRef.current != null) {
      clearTimeout(snapSettleTimerRef.current);
      snapSettleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearExitAnim();
      clearSnapSettleTimer();
    };
  }, [clearExitAnim, clearSnapSettleTimer]);

  const recordProgressSample = useCallback((progress: number) => {
    const now = performance.now();
    const prev = progressSampleRef.current;
    if (prev.time > 0) {
      const dt = (now - prev.time) / 1000;
      if (dt > 0 && dt < 0.45) {
        exitVelocityRef.current = (progress - prev.progress) / dt;
      }
    }
    progressSampleRef.current = { progress, time: now };
  }, []);

  const resetScrollDriver = useCallback(() => {
    if (!isComposeScene) {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
    }
    exitVelocityRef.current = 0;
    progressSampleRef.current = { progress: 0, time: 0 };
  }, [isComposeScene]);

  const scrollProgressFromDriver = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= SCROLL_DRIVER_MIN_OVERFLOW_PX) return 0;

    const raw = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    return Math.min(1, raw / COMPOSE_EXIT_SCROLL_COMPLETE);
  }, []);

  const syncProgressFromScroll = useCallback(() => {
    if (
      exitCommitRef.current ||
      isExitingRef.current ||
      isResettingRef.current
    ) {
      return exitProgressRef.current;
    }

    const progress = scrollProgressFromDriver();
    recordProgressSample(progress);
    setExitProgress(progress);
    return progress;
  }, [recordProgressSample, scrollProgressFromDriver]);

  const runComposeReset = useCallback(() => {
    if (
      exitCommitRef.current ||
      isExitingRef.current ||
      isResettingRef.current
    ) {
      return;
    }

    clearSnapSettleTimer();
    const start = exitProgressRef.current;
    if (start <= 0.002) {
      setExitProgress(0);
      resetScrollDriver();
      return;
    }

    setIsResetting(true);
    clearExitAnim();

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / COMPOSE_RESET_MS);
      const eased = easeOutCubic(t);
      const next = start * (1 - eased);
      setExitProgress(next);

      if (t < 1) {
        exitAnimRef.current = requestAnimationFrame(tick);
        return;
      }

      exitAnimRef.current = null;
      setIsResetting(false);
      setExitProgress(0);
      resetScrollDriver();
    };

    exitAnimRef.current = requestAnimationFrame(tick);
  }, [clearExitAnim, clearSnapSettleTimer, resetScrollDriver]);

  const runComposeExit = useCallback(
    (source: 'scroll' | 'tap') => {
      if (
        submitLockRef.current ||
        exitCommitRef.current ||
        isExitingRef.current ||
        isResettingRef.current ||
        !isScrollReady()
      ) {
        return false;
      }

      clearSnapSettleTimer();
      exitCommitRef.current = true;
      submitLockRef.current = true;
      setIsExiting(true);
      logWhatTransition('WHAT_GESTURE_COMMIT', {
        recipientMode,
        directRecipientId,
        textLength: inputRef.current?.value.trim().length ?? 0,
        validationResult: true,
        blockingReason: null,
        source,
        currentScreen: 'WHAT',
        targetScreen: 'CONFIRM',
      });
      onComposeExitStart?.();
      clearExitAnim();

      const start = exitProgressRef.current;
      const startTime = performance.now();

      if (process.env.NODE_ENV === 'development') {
        console.debug('[instant-ban:compose-exit]', {
          source,
          startProgress: start,
        });
      }

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / COMPOSE_EXIT_MS);
        const eased = easeOutCubic(t);
        const next = start + (1 - start) * eased;
        setExitProgress(next);

        if (t < 1) {
          exitAnimRef.current = requestAnimationFrame(tick);
          return;
        }

        exitAnimRef.current = null;
        handleSubmit();
      };

      exitAnimRef.current = requestAnimationFrame(tick);
      return true;
    },
    [
      clearExitAnim,
      clearSnapSettleTimer,
      directRecipientId,
      handleSubmit,
      isScrollReady,
      onComposeExitStart,
      recipientMode,
    ],
  );

  const shouldSnapComplete = useCallback(() => {
    const progress = exitProgressRef.current;
    const velocity = exitVelocityRef.current;
    return (
      progress >= SNAP_EXIT_THRESHOLD || velocity >= SNAP_EXIT_VELOCITY
    );
  }, []);

  const evaluateSnapOnSettle = useCallback(() => {
    if (
      exitCommitRef.current ||
      isExitingRef.current ||
      isResettingRef.current
    ) {
      return;
    }

    if (!isScrollReady()) {
      if (exitProgressRef.current > 0.002) {
        runComposeReset();
      }
      return;
    }

    const progress = exitProgressRef.current;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[instant-ban:compose-snap]', {
        progress,
        velocity: exitVelocityRef.current,
        complete: shouldSnapComplete(),
      });
    }

    if (shouldSnapComplete()) {
      runComposeExit('scroll');
      return;
    }

    if (progress > 0.002) {
      runComposeReset();
    }
  }, [isScrollReady, runComposeExit, runComposeReset, shouldSnapComplete]);

  const scheduleSnapEvaluate = useCallback(() => {
    if (isGestureActiveRef.current) return;
    clearSnapSettleTimer();
    snapSettleTimerRef.current = setTimeout(() => {
      snapSettleTimerRef.current = null;
      evaluateSnapOnSettle();
    }, SCROLL_SETTLE_MS);
  }, [clearSnapSettleTimer, evaluateSnapOnSettle]);

  const tryAdvanceToConfirm = useCallback(
    (source: 'scroll' | 'tap') => {
      if (!isComposeScene) {
        if (submitLockRef.current || !isScrollReady()) return false;
        submitLockRef.current = true;
        handleSubmit();
        window.setTimeout(() => {
          submitLockRef.current = false;
        }, 400);
        return true;
      }
      return runComposeExit(source);
    },
    [handleSubmit, isComposeScene, isScrollReady, runComposeExit],
  );

  const checkScrollToConfirm = useCallback((): boolean => {
    if (!isComposeScene) {
      const el = scrollRef.current;
      if (!el || submitLockRef.current || !isScrollReady()) return false;

      const { scrollTop, clientHeight, scrollHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      const scrollable = maxScroll > SCROLL_DRIVER_MIN_OVERFLOW_PX;
      const atBottom =
        scrollTop + clientHeight >= scrollHeight - 36;

      if (!scrollable || !atBottom) return false;
      return tryAdvanceToConfirm('scroll');
    }

    evaluateSnapOnSettle();
    return exitCommitRef.current;
  }, [evaluateSnapOnSettle, isComposeScene, isScrollReady, tryAdvanceToConfirm]);

  const onScroll = useCallback(() => {
    if (!isComposeScene) {
      checkScrollToConfirm();
      return;
    }
    if (
      exitCommitRef.current ||
      isExitingRef.current ||
      isResettingRef.current
    ) {
      return;
    }
    syncProgressFromScroll();
    scheduleSnapEvaluate();
  }, [
    checkScrollToConfirm,
    isComposeScene,
    scheduleSnapEvaluate,
    syncProgressFromScroll,
  ]);

  const onSwipeZoneTap = useCallback(() => {
    tryAdvanceToConfirm('tap');
  }, [tryAdvanceToConfirm]);

  const gestureTouchRef = useRef({ y: 0, startProgress: 0 });
  const gestureDiagProgressRef = useRef(-1);

  const applyComposeExitProgress = useCallback(
    (progress: number) => {
      const clamped = Math.min(1, Math.max(0, progress));
      recordProgressSample(clamped);
      setExitProgress(clamped);
      const step = Math.floor(clamped * 10);
      if (step !== gestureDiagProgressRef.current) {
        gestureDiagProgressRef.current = step;
        logWhatTransition('WHAT_GESTURE_PROGRESS', {
          recipientMode,
          directRecipientId,
          progress: Number(clamped.toFixed(3)),
          textLength: inputRef.current?.value.trim().length ?? 0,
          validationResult: isScrollReady(),
          blockingReason: isScrollReady() ? null : 'confirm-guard',
          currentScreen: 'WHAT',
          targetScreen: 'CONFIRM',
        });
      }
      return clamped;
    },
    [
      directRecipientId,
      isScrollReady,
      recipientMode,
      recordProgressSample,
    ],
  );

  const onGestureTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const textLength = inputRef.current?.value.trim().length ?? 0;
      logWhatTransition('WHAT_GESTURE_START', {
        recipientMode,
        directRecipientId,
        textLength,
        textValid: textLength >= 3,
        recipientValid,
        validationResult:
          textLength >= 3 && recipientValid && durationMinutes > 0,
        blockingReason: !recipientValid
          ? 'invalid-recipient'
          : textLength === 0
            ? 'no-text'
            : null,
        currentScreen: 'WHAT',
        targetScreen: 'CONFIRM',
      });
      if (!canSwipeToConfirmRef.current) {
        logComposeGesture('gesture', 'touchstart-skipped-no-text');
        return;
      }
      if (shouldDeferWhatScreenGesture(e.target)) {
        logComposeGesture('gesture', 'touchstart-skipped-interactive', {
          hit:
            e.touches[0] != null
              ? describeHitTarget(
                  e.touches[0].clientX,
                  e.touches[0].clientY,
                )
              : undefined,
        });
        return;
      }
      const touch = e.touches[0];
      logComposeGesture('gesture', 'touchstart', {
        x: touch?.clientX,
        y: touch?.clientY,
        hit: touch
          ? describeHitTarget(touch.clientX, touch.clientY)
          : undefined,
      });
      if (
        !showSwipeHint ||
        exitCommitRef.current ||
        isExitingRef.current ||
        isResettingRef.current
      ) {
        return;
      }
      if (!touch) return;
      clearSnapSettleTimer();
      isGestureActiveRef.current = true;
      exitVelocityRef.current = 0;
      progressSampleRef.current = {
        progress: exitProgressRef.current,
        time: performance.now(),
      };
      gestureTouchRef.current = {
        y: touch.clientY,
        startProgress: exitProgressRef.current,
      };
    },
    [
      clearSnapSettleTimer,
      directRecipientId,
      durationMinutes,
      recipientMode,
      recipientValid,
      showSwipeHint,
    ],
  );

  const onGestureTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isGestureActiveRef.current) return;
      logComposeGesture('gesture', 'touchmove');
      if (
        exitCommitRef.current ||
        isExitingRef.current ||
        isResettingRef.current
      ) {
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dy = gestureTouchRef.current.y - touch.clientY;
      const next =
        gestureTouchRef.current.startProgress + dy / COMPOSE_EXIT_TRAVEL_PX;
      applyComposeExitProgress(next);
    },
    [applyComposeExitProgress],
  );

  const onGestureTouchEnd = useCallback(() => {
    logComposeGesture('gesture', 'touchend');
    isGestureActiveRef.current = false;
    if (
      exitCommitRef.current ||
      isExitingRef.current ||
      isResettingRef.current
    ) {
      return;
    }
    clearSnapSettleTimer();
    evaluateSnapOnSettle();
  }, [clearSnapSettleTimer, evaluateSnapOnSettle]);

  const composeLayerStyle = isComposeScene
    ? ({
        '--compose-exit-progress': String(exitProgress),
      } as CSSProperties)
    : undefined;

  const lowerSwipeZone =
    showSwipeHint ? (
      <div
        className="instant-ban-what-lower-swipe-zone"
        data-no-horizontal-pager=""
      >
        <WhatSwipeTapZone onTap={onSwipeZoneTap} />
        <div className="instant-ban-what-scroll-spacer" aria-hidden />
      </div>
    ) : null;

  const interactiveContent = (
    <div className="instant-ban-what-interactive-content" data-what-interactive>
      {overlayTitle ? (
        <h1 className="instant-ban-send-overlay__title instant-ban-compose-scene__title">
          {overlayTitle}
        </h1>
      ) : null}
      <button
        type="button"
        data-what-back=""
        data-gesture-exclude=""
        className={`instant-ban-flow__back${
          overlayTitle ? ' instant-ban-flow__back--icon-only' : ''
        }${overlayTitle ? ' instant-ban-flow__back--what-compose' : ''}`}
        onClick={handleBackNavigate}
        onPointerDown={() => {
          logWhatHit('back', { source: 'pointerdown' });
          logWhatBack('pointerdown');
        }}
        onPointerUp={() => logWhatBack('pointerup')}
        onTouchStart={() => {
          logWhatHit('back', { source: 'touchstart' });
          logWhatBack('touchstart');
        }}
        onTouchEnd={() => logWhatBack('touchend')}
        aria-label="Назад"
      >
        {overlayTitle ? (
          <WhatBackIcon />
        ) : (
          <span className="instant-ban-flow__back-glyph" aria-hidden>
            ←
          </span>
        )}
      </button>
      <WhatSelectedUser recipientMode={recipientMode} user={selectedUser} />
      <label className="instant-ban-what-field" data-gesture-exclude="">
        {isEmpty ? (
          <span
            className={`instant-ban-what-placeholder-cycle${
              phraseVisible ? '' : ' instant-ban-what-placeholder-cycle--hidden'
            }`}
            aria-hidden
          >
            {PLACEHOLDER_CYCLE_PHRASES[phraseIndex]}
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          data-ban-input=""
          data-gesture-exclude=""
          className="instant-ban-what-input instant-ban-what-input--mobile"
          defaultValue={initialBanText}
          onInput={() => {
            logBanInput('input');
            handleInput();
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPointerDown={() => {
            logWhatHit('input', { source: 'pointerdown' });
            logBanInput('pointerdown');
          }}
          onPointerUp={() => logBanInput('pointerup')}
          onTouchStart={() => {
            logWhatHit('input', { source: 'touchstart' });
            logBanInput('touchstart');
          }}
          onTouchEnd={() => logBanInput('touchend')}
          onClick={() => {
            logWhatHit('input', { source: 'click' });
            logBanInput('click');
          }}
          placeholder=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
        />
      </label>
      <div className="instant-ban-chips instant-ban-chips--mobile">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            data-preset-chip=""
            data-gesture-exclude=""
            className={`instant-ban-chip instant-ban-chip--mobile${
              selectedChip === chip ? ' instant-ban-chip--selected' : ''
            }`}
            onPointerDown={() => handlePresetChipPointerDown(chip)}
            onPointerUp={() => handlePresetChipPointerUp(chip)}
            onClick={() => handlePresetChipClick(chip)}
            onTouchStart={(e) => handlePresetChipTouchStart(chip, e)}
            onTouchEnd={(e) => handlePresetChipTouchEnd(chip, e)}
          >
            {chip}
          </button>
        ))}
      </div>
      <WhatDurationSlider
        value={durationMinutes}
        onChange={setDurationMinutes}
      />
    </div>
  );

  const composeContent = (
    <>
      {interactiveContent}
      {!isComposeScene ? lowerSwipeZone : null}
    </>
  );

  if (isComposeScene) {
    return (
      <div
        className="instant-ban-what instant-ban-what-mobile instant-ban-what-mobile--compose-scene"
        data-instant-ban-view="WhatScreen"
        data-compose-exit-progress={exitProgress.toFixed(3)}
      >
        <div
          className="instant-ban-compose-scene"
          onTouchStart={onGestureTouchStart}
          onTouchMove={onGestureTouchMove}
          onTouchEnd={onGestureTouchEnd}
          onTouchCancel={onGestureTouchEnd}
        >
          <div
            className={`instant-ban-what-exit-layer${
              isExiting || isResetting || exitProgress > 0
                ? ' instant-ban-what-exit-layer--dismissing'
                : ''
            }`}
            style={composeLayerStyle}
            data-instant-ban-view="WhatExitLayer"
          >
            <div className="instant-ban-what-screen-layer instant-ban-what-screen-layer--compose">
              <div className="instant-ban-what-screen-layer__veil" aria-hidden />
              {interactiveContent}
              {lowerSwipeZone}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="instant-ban-what instant-ban-what-mobile"
      data-instant-ban-view="WhatScreen"
      onTouchStart={onGestureTouchStart}
      onTouchMove={onGestureTouchMove}
      onTouchEnd={onGestureTouchEnd}
      onTouchCancel={onGestureTouchEnd}
    >
      <div
        ref={scrollRef}
        className="instant-ban-what-scroll"
        onScroll={onScroll}
      >
        {composeContent}
      </div>
    </div>
  );
}

export const WhatScreen = memo(WhatScreenInner);
