'use client';

import { memo, useCallback, useState } from 'react';
import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
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

const DEFAULT_DURATION = 3;

type Props = {
  selectedUser: FriendCard;
  /** Restored when returning from Confirm. */
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
    <div className="instant-ban-what-selected">
      <AvatarImage
        src={friendAvatarUrl(user)}
        letter={letter}
        sizeClass="w-11 h-11"
        textClass="text-base"
        priority
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
  const [draftText, setDraftText] = useState(initialBanText);
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes);
  const [inputFocused, setInputFocused] = useState(false);

  const canContinue = draftText.trim().length >= 3;

  const handleSubmit = useCallback(() => {
    const text = draftText.trim();
    if (text.length < 3) return;
    onSubmit(text, durationMinutes);
  }, [draftText, durationMinutes, onSubmit]);

  return (
    <div
      className={`instant-ban-what${
        inputFocused ? ' instant-ban-what--typing' : ''
      }`}
    >
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <WhatSelectedUser user={selectedUser} />
      <textarea
        className="instant-ban-what-input"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        placeholder="Запрети что-нибудь…"
        rows={4}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        enterKeyHint="done"
      />
      <div className="instant-ban-chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="instant-ban-chip"
            onClick={() => setDraftText(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="instant-ban-duration">
        <p className="instant-ban-duration__label">На сколько?</p>
        <div className="instant-ban-duration-pills">
          {DURATION_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`instant-ban-duration-pill${
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
      <div className="instant-ban-actions">
        <button
          type="button"
          className="btn-98-primary"
          disabled={!canContinue}
          onClick={handleSubmit}
        >
          ДАЛЬШЕ
        </button>
      </div>
    </div>
  );
}

export const WhatScreen = memo(WhatScreenInner);
