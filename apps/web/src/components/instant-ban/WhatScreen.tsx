'use client';

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
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

/** Bottom edge: scrollTop + clientHeight >= scrollHeight - threshold */
const SCROLL_BOTTOM_THRESHOLD_PX = 80;

/** Intentional downward swipe to confirm (compose-screen). */
const SWIPE_DOWN_MIN_DISTANCE_PX = 52;
const SWIPE_DOWN_MIN_VELOCITY_PX_MS = 0.42;
const SWIPE_HORIZONTAL_DOMINANCE_RATIO = 1.25;

type SwipeStart = {
  x: number;
  y: number;
  t: number;
  pointerId: number;
};

function isSwipeGestureBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('.instant-ban-flow__back')) return true;
  if (target.closest('input, textarea, select')) return true;
  return false;
}

const WhatSwipeTapZone = memo(function WhatSwipeTapZone({
  onTap,
}: {
  onTap: () => void;
}) {
  return (
    <div
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

  useEffect(() => {
    canContinueRef.current = canContinue;
  }, [canContinue]);

  const isSwipeReady = useCallback(() => {
    const textOk = (inputRef.current?.value ?? '').trim().length >= 3;
    return canContinueRef.current && textOk && durationMinutes > 0;
  }, [durationMinutes]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const swipeStartRef = useRef<SwipeStart | null>(null);

  const tryAdvanceToConfirm = useCallback(
    (source: 'scroll' | 'tap' | 'swipe') => {
      if (submitLockRef.current || !isSwipeReady()) return false;
      submitLockRef.current = true;
      handleSubmit();
      window.setTimeout(() => {
        submitLockRef.current = false;
      }, 400);
      if (process.env.NODE_ENV === 'development') {
        console.debug('[instant-ban:what-advance]', { source, triggered: true });
      }
      return true;
    },
    [handleSubmit, isSwipeReady],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || submitLockRef.current) return;

    const { scrollTop, clientHeight, scrollHeight } = el;
    const scrollable =
      scrollHeight - clientHeight > SCROLL_BOTTOM_THRESHOLD_PX;
    const atBottom =
      scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_THRESHOLD_PX;
    const ready = isSwipeReady();
    const triggered = scrollable && atBottom && ready;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[instant-ban:scroll]', {
        scrollTop,
        clientHeight,
        scrollHeight,
        scrollable,
        atBottom,
        canContinue: ready,
        triggered,
      });
    }

    if (!triggered) return;
    tryAdvanceToConfirm('scroll');
  }, [isSwipeReady, tryAdvanceToConfirm]);

  const onSwipeZoneTap = useCallback(() => {
    tryAdvanceToConfirm('tap');
  }, [tryAdvanceToConfirm]);

  const clearSwipeStart = useCallback((pointerId?: number) => {
    const start = swipeStartRef.current;
    if (!start) return;
    if (pointerId != null && start.pointerId !== pointerId) return;
    swipeStartRef.current = null;
  }, []);

  const onComposePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!showSwipeHint || !isSwipeReady() || submitLockRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isSwipeGestureBlockedTarget(e.target)) return;

      swipeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        pointerId: e.pointerId,
      };
    },
    [showSwipeHint, isSwipeReady],
  );

  const onComposePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      if (!start || start.pointerId !== e.pointerId) return;
      swipeStartRef.current = null;

      if (submitLockRef.current || !isSwipeReady()) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Math.max(Date.now() - start.t, 1);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (dy <= 0) return;
      if (absDy < absDx * SWIPE_HORIZONTAL_DOMINANCE_RATIO) return;

      const velocity = dy / dt;
      const intentional =
        absDy >= SWIPE_DOWN_MIN_DISTANCE_PX ||
        velocity >= SWIPE_DOWN_MIN_VELOCITY_PX_MS;

      if (!intentional) return;

      if (process.env.NODE_ENV === 'development') {
        console.debug('[instant-ban:what-swipe]', {
          dx,
          dy,
          dt,
          velocity,
          triggered: true,
        });
      }

      tryAdvanceToConfirm('swipe');
    },
    [isSwipeReady, tryAdvanceToConfirm],
  );

  const onComposePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      clearSwipeStart(e.pointerId);
    },
    [clearSwipeStart],
  );

  return (
    <div
      className="instant-ban-what instant-ban-what-mobile"
      data-instant-ban-view="WhatScreen"
      onPointerDown={showSwipeHint ? onComposePointerDown : undefined}
      onPointerUp={showSwipeHint ? onComposePointerUp : undefined}
      onPointerCancel={showSwipeHint ? onComposePointerCancel : undefined}
    >
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <div
        ref={scrollRef}
        className="instant-ban-what-scroll"
        onScroll={onScroll}
      >
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
        <>
          <WhatSwipeTapZone onTap={onSwipeZoneTap} />
          <div className="instant-ban-what-scroll-spacer" aria-hidden />
        </>
      ) : null}
      </div>
    </div>
  );
}

export const WhatScreen = memo(WhatScreenInner);
