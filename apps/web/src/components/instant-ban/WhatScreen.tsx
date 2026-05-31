'use client';

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

type Props = {
  selectedUser: FriendCard;
  banText: string;
  onChange: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function WhatScreen({
  selectedUser,
  banText,
  onChange,
  onNext,
  onBack,
}: Props) {
  const letter = (
    selectedUser.firstName?.[0] ??
    selectedUser.username?.[0] ??
    '?'
  ).toUpperCase();
  const canContinue = banText.trim().length >= 3;

  return (
    <>
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <div className="instant-ban-what-selected">
        <AvatarImage
          src={friendAvatarUrl(selectedUser)}
          letter={letter}
          sizeClass="w-11 h-11"
          textClass="text-base"
          priority
        />
        <div className="instant-ban-what-selected__name">
          {friendLabel(selectedUser)}
        </div>
      </div>
      <textarea
        className="instant-ban-what-input"
        value={banText}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Запрети что-нибудь…"
        rows={4}
        autoFocus
      />
      <div className="instant-ban-chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="instant-ban-chip"
            onClick={() => onChange(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="instant-ban-actions">
        <button
          type="button"
          className="btn-98-primary"
          disabled={!canContinue}
          onClick={onNext}
        >
          ДАЛЬШЕ
        </button>
      </div>
    </>
  );
}
