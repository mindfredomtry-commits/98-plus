'use client';

import type { FriendCard, UserPublic } from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import { AvatarImage } from '../AvatarImage';

/** Brand-purple no-entry mark (not system-red emoji). */
export function BanGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.2 8.2l7.6 7.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
};

export function SuccessBanCardBody({
  senderUser,
  selectedUser,
  banText,
  durationMinutes,
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
    <>
      <div className="instant-ban-success-card__icon" aria-hidden>
        <BanGlyph />
      </div>
      <p className="instant-ban-success-card__title text-xl font-black text-glow mb-3">
        Запрет отправлен
      </p>
      <div className="result-compare mx-auto mb-3">
        <div className="result-party">
          <div className="modal-avatar overflow-hidden">
            <AvatarImage
              src={userAvatarSrc(senderUser)}
              letter={senderLetter}
              sizeClass="w-full h-full"
              textClass="text-lg"
            />
          </div>
        </div>
        <span className="result-arrow text-accent" aria-hidden>
          →
        </span>
        <div className="result-party">
          <div className="modal-avatar overflow-hidden">
            <AvatarImage
              src={friendAvatarUrl(selectedUser)}
              letter={receiverLetter}
              sizeClass="w-full h-full"
              textClass="text-lg"
            />
          </div>
        </div>
      </div>
      <p className="incoming-modal-text text-lg font-semibold leading-snug mb-3 px-1">
        «{trimmed}»
      </p>
      <p className="instant-ban-success-card__duration text-sm font-semibold">
        На {formatDurationMinutes(durationMinutes)}
      </p>
    </>
  );
}
