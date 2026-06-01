'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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

/** Finger moves down the screen (positive dy). */
const SWIPE_DOWN_THRESHOLD_PX = 56;
const SWIPE_VERTICAL_DOMINANCE = 1.2;

type SwipeStart = { x: number; y: number; pointerId: number };

const SWIPE_TAP_MAX_PX = 12;

function logSwipeZone(
  phase: string,
  data: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[instant-ban:swipe-zone]', { phase, ...data });
  }
  instantBanDebug('swipe-zone', { phase, ...data });
}

const WhatSwipeGestureZone = memo(function WhatSwipeGestureZone({
  onTrigger,
  isReady,
}: {
  onTrigger: () => void;
  isReady: () => boolean;
}) {
  const startRef = useRef<SwipeStart | null>(null);
  const submitLockRef = useRef(false);
  const movedRef = useRef(false);

  const trySubmit = useCallback(
    (
      phase: string,
      dy: number,
      dx: number,
      startY: number,
      currentY: number,
    ): boolean => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const ready = isReady();
      const isSwipeDown = dy > SWIPE_DOWN_THRESHOLD_PX;
      const isMostlyVertical = absDy > absDx * SWIPE_VERTICAL_DOMINANCE;
      const triggered = ready && isSwipeDown && isMostlyVertical;

      logSwipeZone(phase, {
        startY,
        currentY,
        dy,
        dx,
        canContinue: ready,
        triggered,
      });

      if (!triggered || submitLockRef.current) return false;
      submitLockRef.current = true;
      onTrigger();
      window.setTimeout(() => {
        submitLockRef.current = false;
      }, 400);
      return true;
    },
    [isReady, onTrigger],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    movedRef.current = false;
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    logSwipeZone('down', {
      startY: e.clientY,
      currentY: e.clientY,
      dy: 0,
      dx: 0,
      canContinue: isReady(),
      triggered: false,
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, [isReady]);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start || start.pointerId !== e.pointerId) return;

      const dy = e.clientY - start.y;
      const dx = e.clientX - start.x;
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        movedRef.current = true;
      }
      if (dy > 8) {
        e.preventDefault();
      }

      trySubmit('move', dy, dx, start.y, e.clientY);
    },
    [trySubmit],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      startRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* noop */
      }
      if (!start || start.pointerId !== e.pointerId) return;

      const dy = e.clientY - start.y;
      const dx = e.clientX - start.x;
      const ready = isReady();

      if (
        !movedRef.current &&
        Math.abs(dy) <= SWIPE_TAP_MAX_PX &&
        Math.abs(dx) <= SWIPE_TAP_MAX_PX &&
        ready &&
        !submitLockRef.current
      ) {
        logSwipeZone('tap-fallback', {
          startY: start.y,
          currentY: e.clientY,
          dy,
          dx,
          canContinue: ready,
          triggered: true,
        });
        submitLockRef.current = true;
        onTrigger();
        window.setTimeout(() => {
          submitLockRef.current = false;
        }, 400);
        return;
      }

      logSwipeZone('up', {
        startY: start.y,
        currentY: e.clientY,
        dy,
        dx,
        canContinue: ready,
        triggered: false,
      });
    },
    [isReady, onTrigger],
  );

  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    startRef.current = null;
    movedRef.current = false;
    logSwipeZone('cancel', {
      startY: null,
      currentY: e.clientY,
      dy: 0,
      dx: 0,
      canContinue: isReady(),
      triggered: false,
    });
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* noop */
    }
  }, [isReady]);

  return (
    <div
      className="instant-ban-what-swipe-zone"
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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

  return (
    <div
      className="instant-ban-what instant-ban-what-mobile"
      data-instant-ban-view="WhatScreen"
    >
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
        <WhatSwipeGestureZone onTrigger={handleSubmit} isReady={isSwipeReady} />
      ) : null}
    </div>
  );
}

export const WhatScreen = memo(WhatScreenInner);
