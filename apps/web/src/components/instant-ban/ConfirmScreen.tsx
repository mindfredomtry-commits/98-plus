'use client';

import type { FriendCard } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';
import type { EnterPhase, PayoffPhase } from './useConfirmOrbController';

type Props = {
  enterKey: number;
  enterPhase: EnterPhase;
  payoffPhase: PayoffPhase;
  selectedUser: FriendCard;
  banText: string;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function ConfirmScreen({
  enterKey,
  enterPhase,
  payoffPhase,
  selectedUser,
  banText,
  onBack,
}: Props) {
  const name = friendLabel(selectedUser);
  const trimmed = banText.trim();
  const letter = (
    selectedUser.firstName?.[0] ??
    selectedUser.username?.[0] ??
    '?'
  ).toUpperCase();
  const payoffActive = payoffPhase !== 'none';

  return (
    <div
      className="instant-ban-confirm instant-ban-confirm-layout instant-ban-confirm-layout--shared-lobby"
      data-confirm-enter-key={enterKey}
      data-enter-phase={enterPhase}
      data-payoff-phase={payoffPhase}
      data-instant-ban-view="ConfirmScreen"
    >
      {!payoffActive ? (
        <button
          type="button"
          className="instant-ban-confirm-layout__back instant-ban-flow__back"
          onClick={onBack}
        >
          ← Назад
        </button>
      ) : null}
      <div
        className={`instant-ban-confirm-info instant-ban-confirm-copy${
          payoffActive ? ' instant-ban-confirm-copy--hidden' : ''
        }`}
      >
        <span className="instant-ban-confirm-info__label instant-ban-confirm-copy__lead instant-ban-confirm-enter instant-ban-confirm-enter--1">
          Ты запрещаешь
        </span>
        <strong className="instant-ban-confirm-info__name instant-ban-confirm-enter instant-ban-confirm-enter--2">
          {name}
        </strong>
        <div className="instant-ban-confirm-info__avatar instant-ban-confirm-copy__avatar instant-ban-confirm-enter instant-ban-confirm-enter--2">
          <AvatarImage
            src={friendAvatarUrl(selectedUser)}
            letter={letter}
            sizeClass="w-12 h-12"
            textClass="text-base"
            priority
          />
        </div>
        <em className="instant-ban-confirm-info__ban instant-ban-confirm-enter instant-ban-confirm-enter--3">
          &ldquo;{trimmed}&rdquo;
        </em>
      </div>
    </div>
  );
}
