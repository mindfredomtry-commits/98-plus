'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { instantBanDebug } from '@/lib/instant-ban-debug';
import { AvatarImage } from '../AvatarImage';

const QUICK_CHIPS = [
  'сидеть в TikTok',
  'писать бывшему',
  'играть',
  'есть ночью',
  'пить энергетики',
  'лежать до обеда',
] as const;

const DURATION_OPTIONS = [3, 10, 30, 60] as const;

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
/** Commit swipe-away when scroll progress reaches this fraction. */
const SCROLL_COMMIT_PROGRESS = 0.92;
/** Full compose-layer exit animation (tap or scroll commit). */
const COMPOSE_EXIT_MS = 240;

const WhatSwipeTapZone = memo(function WhatSwipeTapZone({
  onTap,
  sentinelRef,
}: {
  onTap: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={sentinelRef}
      className="instant-ban-what-swipe-zone"
      role="presentation"
      aria-hidden
      onClick={onTap}
    >
      <div className="instant-ban-what-swipe-hint">
        <SwipeHintChevron className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--1" />
        <SwipeHintChevron className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--2" />
        <SwipeHintChevron className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--3" />
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
  selectedUser: FriendCard;
  initialBanText?: string;
  initialDurationMinutes?: number;
  /** Unified compose scene title (inside swipe layer). */
  overlayTitle?: string;
  /** 0–1 while compose layer dismisses (overlay fade). */
  onComposeExitProgress?: (progress: number) => void;
  onSubmit: (text: string, durationMinutes: number) => void;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

function SwipeHintChevron({ className }: { className: string }) {
  return (
    <span className={className}>
      <svg
        className="instant-ban-what-swipe-hint__svg"
        viewBox="0 0 44 20"
        width="44"
        height="20"
        aria-hidden
      >
        <path
          d="M4 5 L22 17 L40 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const WhatSelectedUser = memo(function WhatSelectedUser({
  user,
}: {
  user: FriendCard;
}) {
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
  selectedUser,
  initialBanText = '',
  initialDurationMinutes = DEFAULT_DURATION,
  overlayTitle,
  onComposeExitProgress,
  onSubmit,
  onBack,
}: Props) {
  const instanceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canContinueRafRef = useRef<number | null>(null);

  const [canContinue, setCanContinue] = useState(
    initialBanText.trim().length >= 3,
  );
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes);
  const [selectedChip, setSelectedChip] = useState<string | null>(() =>
    chipFromFullText(initialBanText),
  );
  const [isEmpty, setIsEmpty] = useState(initialBanText.length === 0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);

  const isComposeScene = Boolean(overlayTitle);

  const [exitProgress, setExitProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

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
      const next = value.trim().length >= 3;
      setCanContinue((prev) => (prev === next ? prev : next));
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
    instantBanDebug('input-focus', { instanceId });
  }, [instanceId]);

  const handleBlur = useCallback(() => {
    instantBanDebug('input-blur', { instanceId });
  }, [instanceId]);

  const applyChip = useCallback(
    (chip: string) => {
      if (inputRef.current) {
        inputRef.current.value = fullTextFromChip(chip);
      }
      setIsEmpty(false);
      setSelectedChip(chip);
      scheduleCanContinueSync();
    },
    [scheduleCanContinueSync],
  );

  const handleSubmit = useCallback(() => {
    const text = (inputRef.current?.value ?? '').trim();
    if (text.length < 3) return;
    onSubmit(text, durationMinutes);
  }, [durationMinutes, onSubmit]);

  const showSwipeHint =
    canContinue && selectedUser != null && durationMinutes > 0;

  const canContinueRef = useRef(canContinue);
  const exitProgressRef = useRef(0);
  const isExitingRef = useRef(false);

  useEffect(() => {
    canContinueRef.current = canContinue;
  }, [canContinue]);

  useEffect(() => {
    exitProgressRef.current = exitProgress;
  }, [exitProgress]);

  useEffect(() => {
    isExitingRef.current = isExiting;
  }, [isExiting]);

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
    return canContinueRef.current && textOk && durationMinutes > 0;
  }, [durationMinutes]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const exitAnimRef = useRef<number | null>(null);
  const exitCommitRef = useRef(false);

  const clearExitAnim = useCallback(() => {
    if (exitAnimRef.current != null) {
      cancelAnimationFrame(exitAnimRef.current);
      exitAnimRef.current = null;
    }
  }, []);

  useEffect(() => clearExitAnim, [clearExitAnim]);

  const scrollProgressFromDriver = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= SCROLL_DRIVER_MIN_OVERFLOW_PX) return 0;

    return Math.min(1, Math.max(0, el.scrollTop / maxScroll));
  }, []);

  const syncProgressFromScroll = useCallback(() => {
    const progress = scrollProgressFromDriver();
    setExitProgress(progress);
    return progress;
  }, [scrollProgressFromDriver]);

  const runComposeExit = useCallback(
    (source: 'scroll' | 'tap') => {
      if (
        submitLockRef.current ||
        exitCommitRef.current ||
        isExitingRef.current ||
        !isScrollReady()
      ) {
        return false;
      }

      exitCommitRef.current = true;
      submitLockRef.current = true;
      setIsExiting(true);
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
    [clearExitAnim, handleSubmit, isScrollReady],
  );

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

    if (submitLockRef.current || exitCommitRef.current || !isScrollReady()) {
      return false;
    }

    const progress = syncProgressFromScroll();

    if (process.env.NODE_ENV === 'development') {
      console.debug('[instant-ban:compose-scroll-progress]', { progress });
    }

    if (progress < SCROLL_COMMIT_PROGRESS) return false;
    return tryAdvanceToConfirm('scroll');
  }, [
    isComposeScene,
    isScrollReady,
    syncProgressFromScroll,
    tryAdvanceToConfirm,
  ]);

  const onScroll = useCallback(() => {
    if (!isComposeScene) {
      checkScrollToConfirm();
      return;
    }
    if (exitCommitRef.current || isExitingRef.current) return;
    syncProgressFromScroll();
    checkScrollToConfirm();
  }, [checkScrollToConfirm, isComposeScene, syncProgressFromScroll]);

  const onSwipeZoneTap = useCallback(() => {
    tryAdvanceToConfirm('tap');
  }, [tryAdvanceToConfirm]);

  const gestureTouchRef = useRef({ y: 0, scroll: 0 });

  const onGestureTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const el = scrollRef.current;
      if (!el || !showSwipeHint || exitCommitRef.current) return;
      gestureTouchRef.current = {
        y: e.touches[0]?.clientY ?? 0,
        scroll: el.scrollTop,
      };
    },
    [showSwipeHint],
  );

  const onGestureTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const el = scrollRef.current;
      if (!el || exitCommitRef.current || isExitingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = gestureTouchRef.current.y - touch.clientY;
      el.scrollTop = gestureTouchRef.current.scroll + dy;
      syncProgressFromScroll();
      checkScrollToConfirm();
    },
    [checkScrollToConfirm, syncProgressFromScroll],
  );

  useEffect(() => {
    if (!showSwipeHint || !isComposeScene) return;

    const root = scrollRef.current;
    const sentinel = scrollSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        checkScrollToConfirm();
      },
      {
        root,
        threshold: 0.35,
        rootMargin: '0px 0px -4px 0px',
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [showSwipeHint, isComposeScene, checkScrollToConfirm]);

  const composeLayerStyle = isComposeScene
    ? ({
        '--compose-exit-progress': String(exitProgress),
      } as CSSProperties)
    : undefined;

  const composeContent = (
    <>
      {overlayTitle ? (
        <h1 className="instant-ban-send-overlay__title instant-ban-compose-scene__title">
          {overlayTitle}
        </h1>
      ) : null}
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <WhatSelectedUser user={selectedUser} />
      <label className="instant-ban-what-field">
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
          className="instant-ban-what-input instant-ban-what-input--mobile"
          defaultValue={initialBanText}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
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
            className={`instant-ban-chip instant-ban-chip--mobile${
              selectedChip === chip ? ' instant-ban-chip--selected' : ''
            }`}
            onClick={() => applyChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="instant-ban-duration instant-ban-duration--mobile">
        <p className="instant-ban-duration__label">На сколько?</p>
        <div className="instant-ban-duration-pills">
          {DURATION_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`instant-ban-duration-pill instant-ban-duration-pill--mobile${
                durationMinutes === minutes
                  ? ' instant-ban-duration-pill--active'
                  : ''
              }`}
              onClick={() => setDurationMinutes(minutes)}
            >
              {minutes}м
            </button>
          ))}
        </div>
      </div>
      {showSwipeHint ? (
        <div
          className="instant-ban-compose-scene__gesture"
          onTouchStart={isComposeScene ? onGestureTouchStart : undefined}
          onTouchMove={isComposeScene ? onGestureTouchMove : undefined}
        >
          <WhatSwipeTapZone
            sentinelRef={scrollSentinelRef}
            onTap={onSwipeZoneTap}
          />
          <div className="instant-ban-what-scroll-spacer" aria-hidden />
        </div>
      ) : null}
    </>
  );

  if (isComposeScene) {
    return (
      <div
        className={`instant-ban-what instant-ban-what-mobile instant-ban-what-mobile--compose-scene${
          isExiting || exitProgress > 0
            ? ' instant-ban-what-mobile--compose-dismissing'
            : ''
        }`}
        data-instant-ban-view="WhatScreen"
        data-compose-exit-progress={exitProgress.toFixed(3)}
        style={composeLayerStyle}
      >
        <div
          className="instant-ban-compose-scene"
          style={composeLayerStyle}
        >
          <div
            className="instant-ban-compose-scene__veil"
            aria-hidden
            style={
              {
                '--compose-exit-progress': String(exitProgress),
              } as CSSProperties
            }
          />
          {showSwipeHint ? (
            <div
              ref={scrollRef}
              className="instant-ban-compose-scene__scroll-driver"
              onScroll={onScroll}
              aria-hidden
            >
              <div className="instant-ban-compose-scene__scroll-driver-track" />
              <div
                ref={scrollSentinelRef}
                className="instant-ban-compose-scene__scroll-driver-sentinel"
              />
            </div>
          ) : null}
          <div
            className="instant-ban-compose-scene__layer"
            style={composeLayerStyle}
          >
            {composeContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="instant-ban-what instant-ban-what-mobile"
      data-instant-ban-view="WhatScreen"
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
