'use client';

import type { FriendCard } from '@98plus/shared';

type Props = {
  selectedUser: FriendCard;
  banText: string;
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
  sending,
  error,
  onConfirm,
  onRetry,
  onBack,
}: Props) {
  const name = friendLabel(selectedUser);
  const trimmed = banText.trim();

  return (
    <>
      <button type="button" className="instant-ban-flow__back" onClick={onBack}>
        ← Назад
      </button>
      <div className="instant-ban-confirm-copy">
        Ты запрещаешь
        <br />
        <strong>{name}</strong>
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
              : 'Нажми на символ'}
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
