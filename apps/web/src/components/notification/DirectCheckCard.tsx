/**
 * Phase 0 — prop-driven Check card (no useApp / queue writes).
 */
'use client';

import type { BanInteraction } from '@98plus/shared';
import {
  formatSenderDisplayName,
  getCheckModalView,
} from '@98plus/shared';
import { BigButton } from '@/components/BigButton';
import { AvatarImage } from '@/components/AvatarImage';
import { userAvatarSrc } from '@/lib/user-public-avatar';

export type DirectCheckCardProps = {
  ban: BanInteraction;
  viewerId: string | null;
  disabled?: boolean;
  onConfirm: (completed: boolean) => void;
};

export function DirectCheckCard({
  ban,
  viewerId,
  disabled = false,
  onConfirm,
}: DirectCheckCardProps) {
  const view = getCheckModalView(ban, viewerId);
  const displayed = view?.displayedUser ?? ban.sender;
  const name = formatSenderDisplayName(
    displayed?.username,
    displayed?.firstName,
  );
  const avatar = userAvatarSrc(displayed);
  const letter = (name.replace(/^@/, '').trim()[0] || '?').toUpperCase();
  const title = view?.title ?? 'Проверка';

  return (
    <div className="direct-notification-card direct-check-card" data-kind="check">
      <div className="direct-notification-card__header">
        <AvatarImage
          src={avatar}
          letter={letter}
          sizeClass="w-12 h-12"
          alt={name}
        />
        <div>
          <div className="direct-notification-card__title">{title}</div>
          <div className="direct-notification-card__subtitle">{name}</div>
        </div>
      </div>
      {ban.text ? (
        <p className="direct-notification-card__body">{ban.text}</p>
      ) : null}
      <div className="direct-notification-card__actions">
        <BigButton
          disabled={disabled}
          onClick={() => {
            if (!disabled) onConfirm(true);
          }}
        >
          Выполнено
        </BigButton>
        <BigButton
          disabled={disabled}
          variant="ghost"
          onClick={() => {
            if (!disabled) onConfirm(false);
          }}
        >
          Не выполнено
        </BigButton>
      </div>
    </div>
  );
}
