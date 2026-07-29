'use client';

import {
  COMPOSE_RECIPIENT_MODES,
  type ComposeRecipientMode,
  type FriendCard,
} from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from './WhatBackIcon';
import type { EnterPhase, HoldPhase } from './useConfirmOrbController';

type Props = {
  enterKey: number;
  enterPhase: EnterPhase;
  holdPhase: HoldPhase;
  recipientMode: ComposeRecipientMode;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  onBack: () => void;
};

function friendLabel(friend: FriendCard): string {
  return friend.firstName || friend.username || '—';
}

export function ConfirmScreen({
  enterKey,
  enterPhase,
  holdPhase,
  recipientMode,
  selectedUser,
  banText,
  durationMinutes,
  onBack,
}: Props) {
  const knownBySender =
    recipientMode === COMPOSE_RECIPIENT_MODES.KNOWN_BY_SENDER;
  const name = knownBySender
    ? 'ты уже знаешь кто это'
    : selectedUser
      ? friendLabel(selectedUser)
      : '—';
  const trimmed = banText.trim();
  const letter = (
    selectedUser?.firstName?.[0] ??
    selectedUser?.username?.[0] ??
    '?'
  ).toUpperCase();
  return (
    <div
      className="instant-ban-confirm instant-ban-confirm-layout instant-ban-confirm-layout--shared-lobby"
      data-confirm-enter-key={enterKey}
      data-enter-phase={enterPhase}
      data-hold-phase={holdPhase}
      data-instant-ban-view="ConfirmScreen"
    >
      <button
        type="button"
        className="instant-ban-confirm-layout__back instant-ban-flow__back instant-ban-flow__back--icon-only instant-ban-flow__back--what-compose"
        onClick={onBack}
        aria-label="Назад"
      >
        <WhatBackIcon />
      </button>
      <div className="instant-ban-confirm-info instant-ban-confirm-copy">
        <span className="instant-ban-confirm-info__label instant-ban-confirm-copy__lead instant-ban-confirm-enter instant-ban-confirm-enter--1">
          Ты запрещаешь
        </span>
        <strong className="instant-ban-confirm-info__name instant-ban-confirm-enter instant-ban-confirm-enter--2">
          {name}
        </strong>
        <div className="instant-ban-confirm-info__avatar instant-ban-confirm-copy__avatar instant-ban-confirm-enter instant-ban-confirm-enter--2">
          <AvatarImage
            src={knownBySender || !selectedUser ? null : friendAvatarUrl(selectedUser)}
            letter={knownBySender ? '' : letter}
            sizeClass="w-12 h-12"
            textClass="text-base"
            priority
          />
        </div>
        <em className="instant-ban-confirm-info__ban instant-ban-confirm-enter instant-ban-confirm-enter--3">
          &ldquo;{trimmed}&rdquo;
        </em>
        <span
          className="instant-ban-confirm-info__duration instant-ban-confirm-enter instant-ban-confirm-enter--4"
          aria-label={`Длительность запрета: ${durationMinutes} минут`}
        >
          {durationMinutes} мин
        </span>
      </div>
    </div>
  );
}
