'use client';

import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

type Props = {
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
  onRetry: () => void;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function ConfirmScreen({
  selectedUser,
  banText,
  durationMinutes: _durationMinutes,
  sending,
  error,
  onConfirm,
  onRetry,
  onBack,
}: Props) {
  const name = friendLabel(selectedUser);
  const trimmed = banText.trim();
  const letter = (
    selectedUser.firstName?.[0] ??
    selectedUser.username?.[0] ??
    '?'
  ).toUpperCase();

  return (
    <>
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <div className="instant-ban-confirm-copy">
        Ты запрещаешь
        <strong>{name}</strong>
        <div className="instant-ban-confirm-copy__avatar">
          <AvatarImage
            src={friendAvatarUrl(selectedUser)}
            letter={letter}
            sizeClass="w-12 h-12"
            textClass="text-base"
            priority
          />
        </div>
        <em>&ldquo;{trimmed}&rdquo;</em>
      </div>
      <div className="instant-ban-confirm-orb-wrap">
        <button
          type="button"
          className="instant-ban-confirm-orb-btn"
          disabled={sending}
          onClick={onConfirm}
          aria-label="Подтвердить запрет"
        >
          <span className="instant-ban-confirm-orb-ring" aria-hidden />
          <span className="instant-ban-confirm-orb">
            <span className="instant-ban-confirm-orb__title">98+</span>
          </span>
        </button>
        <p
          className={`instant-ban-status${error ? ' instant-ban-status--error' : ''}`}
        >
          {sending
            ? 'Запрет отправляется…'
            : error
              ? 'Не получилось отправить запрет'
              : 'Нажми'}
        </p>
        {error ? (
          <button type="button" className="instant-ban-secondary" onClick={onRetry}>
            Попробовать снова
          </button>
        ) : null}
      </div>
    </>
  );
}
