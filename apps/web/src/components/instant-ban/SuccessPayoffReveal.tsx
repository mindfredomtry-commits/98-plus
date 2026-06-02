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
  showCta: boolean;
  onAgain?: () => void;
};

export function SuccessPayoffReveal({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
  showCta,
  onAgain,
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
    <div className="instant-ban-payoff-inner">
      <div className="instant-ban-payoff-reveal__icon">🚫</div>
      <h2 className="instant-ban-payoff-reveal__title">Запрет отправлен</h2>
      <div className="instant-ban-payoff-reveal__participants">
        <div className="instant-ban-payoff-reveal__sender-wrap">
          <AvatarImage
            src={userAvatarSrc(senderUser)}
            letter={senderLetter}
            sizeClass="w-11 h-11"
            textClass="text-sm"
          />
        </div>
        <span className="instant-ban-payoff-reveal__arrow" aria-hidden>
          →
        </span>
        <AvatarImage
          src={friendAvatarUrl(selectedUser)}
          letter={receiverLetter}
          sizeClass="w-11 h-11"
          textClass="text-sm"
        />
      </div>
      <p className="instant-ban-payoff-reveal__quote">&ldquo;{trimmed}&rdquo;</p>
      <p className="instant-ban-payoff-reveal__duration">
        На {formatDurationMinutes(durationMinutes)}
      </p>
      {showCta ? (
        <button
          type="button"
          className="btn-98-primary instant-ban-payoff-reveal__cta"
          onClick={onAgain}
        >
          Запретить ещё!
        </button>
      ) : (
        <span
          className="btn-98-primary instant-ban-payoff-reveal__cta instant-ban-payoff-reveal__cta--placeholder"
          aria-hidden
        />
      )}
    </div>
  );
}
