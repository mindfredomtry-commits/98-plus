'use client';

import type { BanInteraction } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { WhatBackIcon } from './WhatBackIcon';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import {
  formatBanRemaining,
  useBanRemainingMs,
} from '@/lib/ban-remaining-time';
import {
  type BansTab,
  banHistoryStatusLabel,
  banStatusLabel,
  bansTabEmptyMessage,
  opponentForBan,
  userDisplayLetter,
} from './bans-overlay-utils';

const TABS: { id: BansTab; label: string }[] = [
  { id: 'yours', label: 'Твои' },
  { id: 'toYou', label: 'Тебе' },
  { id: 'history', label: 'История' },
  { id: 'archive', label: 'Архив' },
];

type Props = {
  tab: BansTab;
  bans: BanInteraction[];
  userId: string | undefined;
  onTabChange: (tab: BansTab) => void;
  onClose: () => void;
  onSelectBan: (ban: BanInteraction) => void;
};

function BanListItem({
  ban,
  tab,
  userId,
  onSelect,
}: {
  ban: BanInteraction;
  tab: BansTab;
  userId: string | undefined;
  onSelect: () => void;
}) {
  const opponent = opponentForBan(ban, userId);
  const left = useBanRemainingMs(ban);
  const isHistory = tab === 'history';
  const timerText =
    left != null
      ? formatBanRemaining(left, 'compact')
      : isHistory
        ? banHistoryStatusLabel(ban)
        : banStatusLabel(ban.status);

  return (
    <button
      type="button"
      className="instant-ban-bans-list-item"
      onClick={onSelect}
    >
      <AvatarImage
        src={userAvatarSrc(opponent)}
        letter={userDisplayLetter(opponent)}
        sizeClass="w-11 h-11"
        textClass="text-sm"
        className="instant-ban-bans-list-item__avatar"
      />
      <div className="instant-ban-bans-list-item__body">
        <p className="instant-ban-bans-list-item__text">
          {ban.text?.trim() || '—'}
        </p>
        <p className="instant-ban-bans-list-item__timer">{timerText}</p>
      </div>
      <span className="instant-ban-bans-list-item__star" aria-hidden>
        ★
      </span>
    </button>
  );
}

export function BansOverlay({
  tab,
  bans,
  userId,
  onTabChange,
  onClose,
  onSelectBan,
}: Props) {
  const emptyMessage = bansTabEmptyMessage(tab);

  return (
    <div
      className="instant-ban-bans-overlay"
      data-instant-ban-view="BansOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Твои запреты"
    >
      <div className="instant-ban-bans-overlay__dim" aria-hidden />
      <div className="instant-ban-bans-overlay__panel">
        <div className="instant-ban-bans-overlay__chrome">
          <header className="instant-ban-bans-overlay__header">
            <button
              type="button"
              className="instant-ban-flow__back instant-ban-flow__back--icon-only instant-ban-bans-overlay__back"
              onClick={onClose}
              aria-label="Назад в лобби"
            >
              <WhatBackIcon />
            </button>
            <h2 className="instant-ban-bans-overlay__title">твои запреты</h2>
          </header>

          <div className="instant-ban-bans-overlay__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`instant-ban-bans-overlay__tab${
                  tab === t.id ? ' instant-ban-bans-overlay__tab--active' : ''
                }`}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="instant-ban-bans-overlay__list" role="tabpanel">
          {bans.length === 0 ? (
            <p className="instant-ban-bans-overlay__empty">{emptyMessage}</p>
          ) : (
            bans.map((ban) => (
              <BanListItem
                key={ban.id}
                ban={ban}
                tab={tab}
                userId={userId}
                onSelect={() => onSelectBan(ban)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
