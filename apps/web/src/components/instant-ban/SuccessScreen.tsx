'use client';

import type { FriendCard } from '@98plus/shared';

type Props = {
  selectedUser: FriendCard;
  banText: string;
  onAgain: () => void;
  onReturn: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function SuccessScreen({
  selectedUser,
  banText,
  onAgain,
  onReturn,
}: Props) {
  const name = friendLabel(selectedUser);
  const trimmed = banText.trim();

  return (
    <>
      <div className="instant-ban-success-card">
        <div className="instant-ban-success-card__icon" aria-hidden>
          🚫
        </div>
        <h2 className="instant-ban-success-card__title">Запрет отправлен</h2>
        <p className="instant-ban-success-card__body">
          {name}
          <br />
          теперь запрещено:
          <br />
          <strong>&ldquo;{trimmed}&rdquo;</strong>
        </p>
      </div>
      <div className="instant-ban-actions instant-ban-actions--dual">
        <button type="button" className="btn-98-primary" onClick={onAgain}>
          ЗАПРЕТИТЬ ЕЩЁ
        </button>
        <button type="button" className="instant-ban-secondary" onClick={onReturn}>
          ВЕРНУТЬСЯ
        </button>
      </div>
    </>
  );
}
