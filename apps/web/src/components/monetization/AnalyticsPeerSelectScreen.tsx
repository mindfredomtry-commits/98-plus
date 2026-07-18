'use client';

import type { FriendCard } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from '../instant-ban/WhatBackIcon';
import { friendAvatarUrl } from '@/lib/avatar-url';
import type { AnalyticsPeer } from '@/lib/relationship-analytics-types';

type Props = {
  friends: FriendCard[];
  onSelect: (peer: AnalyticsPeer) => void;
  onBack: () => void;
};

function friendDisplayName(friend: FriendCard): string {
  const first = friend.firstName?.trim();
  if (first) return first;
  const username = friend.username?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  return 'друг';
}

function friendLetter(friend: FriendCard): string {
  const source =
    friend.firstName?.trim() || friend.username?.replace(/^@/, '').trim();
  return (source?.[0] ?? '?').toUpperCase();
}

/** Friends with a real registered userId — only these can be analytics peers. */
export function analyticsEligibleFriends(
  friends: FriendCard[],
): FriendCard[] {
  return friends.filter((f) => {
    const id = f.userId?.trim();
    return Boolean(id);
  });
}

export function AnalyticsPeerSelectScreen({
  friends,
  onSelect,
  onBack,
}: Props) {
  const eligible = analyticsEligibleFriends(friends);

  return (
    <div
      className="monetization-screen"
      role="dialog"
      aria-label="С кем посмотреть аналитику"
    >
      <div className="monetization-screen__scroll">
        <header className="monetization-screen__header">
          <button
            type="button"
            className="monetization-back"
            onClick={onBack}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <h2 className="monetization-screen__nav-title">с кем посмотреть?</h2>
        </header>

        <p className="monetization-peer-lead">
          выбери человека, чтобы узнать, что происходит между вами
        </p>

        {eligible.length === 0 ? (
          <div className="monetization-analytics-empty">
            <p className="monetization-analytics-empty__title">
              пока не с кем строить аналитику
            </p>
            <p className="monetization-analytics-empty__text">
              добавь человека и совершите несколько действий в 98+
            </p>
            <button
              type="button"
              className="monetization-cta"
              onClick={onBack}
            >
              назад
            </button>
          </div>
        ) : (
          <ul className="monetization-peer-list">
            {eligible.map((friend) => {
              const userId = friend.userId!.trim();
              const displayName = friendDisplayName(friend);
              return (
                <li key={userId}>
                  <button
                    type="button"
                    className="monetization-peer-row"
                    onClick={() =>
                      onSelect({
                        userId,
                        displayName,
                        avatarUrl: friendAvatarUrl(friend),
                      })
                    }
                  >
                    <AvatarImage
                      src={friendAvatarUrl(friend)}
                      letter={friendLetter(friend)}
                      sizeClass="w-12 h-12"
                      textClass="text-lg"
                      ringClassName="ring-white/10"
                    />
                    <span className="monetization-peer-row__name">
                      {displayName}
                    </span>
                    <span className="monetization-peer-row__chevron" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
