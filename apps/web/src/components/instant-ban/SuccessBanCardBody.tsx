'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import { AvatarImage } from '../AvatarImage';

function formatDurationMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m >= 60 && m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? '1 час' : `${h} ч`;
  }
  return `${m} мин`;
}

type Props = {
  senderUser: UserPublic | null | undefined;
  selectedUser: FriendCard;
  banText: string;
  durationMinutes: number;
  contentClassName?: string;
};

export function SuccessBanCardBody({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  contentClassName = '',
}: Props) {
  const trimmed = banText.trim();
  const receiverLetter = (
    selectedUser.firstName?.[0] ??
    selectedUser.username?.[0] ??
    '?'
  ).toUpperCase();
  const senderLetter = (
    senderUser?.firstName?.[0] ??
    senderUser?.username?.[0] ??
    '?'
  ).toUpperCase();

  return (
    <div className={`instant-ban-success-card__content ${contentClassName}`.trim()}>
      <div className="instant-ban-success-card__icon" aria-hidden>
        🚫
      </div>
      <h2 className="instant-ban-success-card__title">Запрет отправлен</h2>
      <div className="instant-ban-success-card__participants">
        <AvatarImage
          src={userAvatarSrc(senderUser)}
          letter={senderLetter}
          sizeClass="w-11 h-11"
          textClass="text-sm"
        />
        <span className="instant-ban-success-card__arrow" aria-hidden>
          →
        </span>
        <AvatarImage
          src={friendAvatarUrl(selectedUser)}
          letter={receiverLetter}
          sizeClass="w-11 h-11"
          textClass="text-sm"
        />
      </div>
      <p className="instant-ban-success-card__quote">&ldquo;{trimmed}&rdquo;</p>
      <p className="instant-ban-success-card__duration">
        На {formatDurationMinutes(durationMinutes)}
      </p>
    </div>
  );
}
