'use client';

import {
  COMPOSE_RECIPIENT_MODES,
  type ComposeRecipientMode,
  type FriendCard,
  type UserPublic,
} from '@98plus/shared';
import { friendAvatarUrl } from '@/lib/avatar-url';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import { AvatarImage } from '../AvatarImage';

export const BAN_GLYPH_RADIUS = 9;

/** Success-card no-entry mark — circle + diagonal slash (orb energy styling via CSS). */
export function BanGlyph({
  className = '',
  strokeWidth = 2.75,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  const edge = BAN_GLYPH_RADIUS / Math.SQRT2;
  const x1 = 12 - edge;
  const y1 = 12 - edge;
  const x2 = 12 + edge;
  const y2 = 12 + edge;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r={BAN_GLYPH_RADIUS}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d={`M${x1} ${y1}L${x2} ${y2}`}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Same mark as lobby CTA "🚫 ЗАПРЕЩАТЬ" — emoji only inside Success Card. */
export function LobbyBanMark({ className = '' }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      🚫
    </span>
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
  recipientMode: ComposeRecipientMode;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
};

export function SuccessBanCardBody({
  senderUser,
  recipientMode,
  selectedUser,
  banText,
  durationMinutes,
}: Props) {
  const trimmed = banText.trim();
  const knownBySender =
    recipientMode === COMPOSE_RECIPIENT_MODES.KNOWN_BY_SENDER;
  const receiverLetter = (
    selectedUser?.firstName?.[0] ??
    selectedUser?.username?.[0] ??
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
        {knownBySender ? 'запрет готов' : 'Запрет отправлен'}
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
              src={
                knownBySender || !selectedUser
                  ? null
                  : friendAvatarUrl(selectedUser)
              }
              letter={knownBySender ? '' : receiverLetter}
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
