'use client';

import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';

type Props = {
  friends: FriendCard[];
  onSelect: (friend: FriendCard) => void;
  onInvite: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function WhoScreen({ friends, onSelect, onInvite }: Props) {
  if (friends.length === 0) {
    return (
      <div className="instant-ban-empty">
        <p className="instant-ban-empty__text">Пока некого запрещать</p>
        <button type="button" className="btn-98-primary" onClick={onInvite}>
          Позвать человека
        </button>
      </div>
    );
  }

  return (
    <div className="instant-ban-who-list">
      {friends.map((friend, i) => {
        const letter = (
          friend.firstName?.[0] ??
          friend.username?.[0] ??
          '?'
        ).toUpperCase();
        return (
          <button
            key={friend.id ?? friend.userId ?? `friend:${i}`}
            type="button"
            className="instant-ban-who-item"
            onClick={() => onSelect(friend)}
          >
            <AvatarImage
              src={friendAvatarUrl(friend)}
              letter={letter}
              sizeClass="w-12 h-12"
              textClass="text-lg"
              priority
            />
            <div>
              <div className="instant-ban-who-item__name">{friendLabel(friend)}</div>
              {friend.username ? (
                <div className="instant-ban-who-item__username">@{friend.username}</div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
