'use client';

import { memo, useCallback, useEffect, useId, useRef, useState, type TouchEvent } from 'react';
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

const DEFAULT_DURATION = 3;

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

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || !canContinue) return;

      const t = e.changedTouches[0];
      if (!t) return;

      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (dy < 56) return;
      if (Math.abs(dx) > Math.abs(dy) * 0.6) return;

      handleSubmit();
    },
    [canContinue, handleSubmit],
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  return (
    <div
      className="instant-ban-what instant-ban-what-mobile"
      data-instant-ban-view="WhatScreen"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <WhatSelectedUser user={selectedUser} />
      <label className="instant-ban-what-field">
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          className="instant-ban-what-input instant-ban-what-input--mobile"
          defaultValue={initialBanText}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Запрети что-нибудь…"
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
        <div className="instant-ban-what-swipe-hint" aria-hidden>
          <span className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--1">
            ⌄
          </span>
          <span className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--2">
            ⌄
          </span>
          <span className="instant-ban-what-swipe-hint__chevron instant-ban-what-swipe-hint__chevron--3">
            ⌄
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const WhatScreen = memo(WhatScreenInner);
