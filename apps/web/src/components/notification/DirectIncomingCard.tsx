/**
 * Phase 0 — prop-driven Incoming card (no useApp / queue writes).
 */
'use client';

import type { BanInteraction } from '@98plus/shared';
import { formatSenderDisplayName, INCOMING_OVERBOARD_BUTTON_EMOJI } from '@98plus/shared';
import { BigButton } from '@/components/BigButton';
import { AvatarImage } from '@/components/AvatarImage';
import { userAvatarSrc } from '@/lib/user-public-avatar';

export type DirectIncomingCardProps = {
  ban: BanInteraction;
  disabled?: boolean;
  onAccept: () => void;
  onReply?: () => void;
};

export function DirectIncomingCard({
  ban,
  disabled = false,
  onAccept,
  onReply,
}: DirectIncomingCardProps) {
  const sender = ban.sender;
  const name = formatSenderDisplayName(
    sender?.username,
    sender?.firstName,
  );
  const avatar = userAvatarSrc(sender);
  const letter = (name.replace(/^@/, '').trim()[0] || '?').toUpperCase();

  return (
    <div className="direct-notification-card direct-incoming-card" data-kind="incoming">
      <div className="direct-notification-card__header">
        <AvatarImage
          src={avatar}
          letter={letter}
          sizeClass="w-12 h-12"
          alt={name}
        />
        <div>
          <div className="direct-notification-card__title">{name}</div>
          <div className="direct-notification-card__subtitle">Входящий запрет</div>
        </div>
      </div>
      {ban.text ? (
        <p className="direct-notification-card__body">{ban.text}</p>
      ) : null}
      <div className="direct-notification-card__actions">
        <BigButton
          disabled={disabled}
          onClick={() => {
            if (!disabled) onAccept();
          }}
        >
          {INCOMING_OVERBOARD_BUTTON_EMOJI} Перебор
        </BigButton>
        {onReply ? (
          <BigButton
            disabled={disabled}
            variant="ghost"
            onClick={() => {
              if (!disabled) onReply();
            }}
          >
            Ответить
          </BigButton>
        ) : null}
      </div>
    </div>
  );
}
