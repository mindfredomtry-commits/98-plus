'use client';

import type { BanInteraction } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { BigButton } from '../BigButton';
import { WhatBackIcon } from './WhatBackIcon';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import {
  formatBanRemaining,
  useBanRemainingMs,
} from '@/lib/ban-remaining-time';
import {
  banStatusLabel,
  userDisplayLetter,
  userDisplayName,
} from './bans-overlay-utils';

type Props = {
  ban: BanInteraction;
  onBack: () => void;
  onBanMore: () => void;
  onShare: () => void;
};

function PartyAvatar({ user }: { user: BanInteraction['sender'] }) {
  return (
    <div className="instant-ban-active-ban-card__party">
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={userDisplayLetter(user)}
        sizeClass="w-12 h-12"
        textClass="text-base"
      />
      <span className="instant-ban-active-ban-card__party-name">
        {userDisplayName(user)}
      </span>
    </div>
  );
}

export function ActiveBanCardOverlay({
  ban,
  onBack,
  onBanMore,
  onShare,
}: Props) {
  const left = useBanRemainingMs(ban.remainingMs);
  const timerText =
    left != null
      ? formatBanRemaining(left, 'clock')
      : banStatusLabel(ban.status);
  const statusTitle =
    ban.status === 'active' ? 'запрещено' : banStatusLabel(ban.status);

  return (
    <div
      className="instant-ban-active-ban-card-layer"
      data-instant-ban-view="ActiveBanCardOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Карточка запрета"
    >
      <div className="instant-ban-active-ban-card-layer__dim" aria-hidden />
      <div className="instant-ban-active-ban-card modal-card">
        <button
          type="button"
          className="instant-ban-flow__back instant-ban-flow__back--icon-only instant-ban-active-ban-card__back"
          onClick={onBack}
          aria-label="Назад к списку"
        >
          <WhatBackIcon />
        </button>

        <div className="modal-card-body instant-ban-active-ban-card__body">
          <p className="instant-ban-active-ban-card__status">{statusTitle}</p>

          <div className="instant-ban-active-ban-card__participants">
            <PartyAvatar user={ban.sender} />
            <span className="instant-ban-active-ban-card__arrow" aria-hidden>
              →
            </span>
            <PartyAvatar user={ban.receiver} />
          </div>

          <p className="instant-ban-active-ban-card__text">
            &ldquo;{ban.text?.trim() || '—'}&rdquo;
          </p>

          <p className="instant-ban-active-ban-card__timer">{timerText}</p>

          <div className="instant-ban-active-ban-card__actions">
            <BigButton onClick={onBanMore}>🚫 Запретить ещё!</BigButton>
            <BigButton variant="ghost" onClick={onShare}>
              Поделиться
            </BigButton>
          </div>
        </div>
      </div>
    </div>
  );
}
