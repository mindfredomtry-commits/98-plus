'use client';

import { useEffect, useState } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { BanSaveStar } from './BanSaveStar';
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
  isBanTerminal,
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
  savedBanIds: ReadonlySet<string>;
  archiveToast: string | null;
  onTabChange: (tab: BansTab) => void;
  onClose: () => void;
  onSelectBan: (ban: BanInteraction) => void;
  onToggleSave: (ban: BanInteraction) => void;
};

function BanListItem({
  ban,
  tab,
  userId,
  saved,
  onSelect,
  onToggleSave,
}: {
  ban: BanInteraction;
  tab: BansTab;
  userId: string | undefined;
  saved: boolean;
  onSelect: () => void;
  onToggleSave: () => void;
}) {
  const opponent = opponentForBan(ban, userId);
  const left = useBanRemainingMs(ban);
  const useOutcomeLabel =
    tab === 'history' || (tab === 'archive' && isBanTerminal(ban.status));
  const timerText =
    left != null
      ? formatBanRemaining(left, 'compact')
      : useOutcomeLabel
        ? banHistoryStatusLabel(ban)
        : banStatusLabel(ban.status);

  return (
    <div className="instant-ban-bans-list-item">
      <button
        type="button"
        className="instant-ban-bans-list-item__main"
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
      </button>
      <BanSaveStar
        banId={ban.id}
        saved={saved}
        onToggle={onToggleSave}
      />
    </div>
  );
}

export function BansOverlay({
  tab,
  bans,
  userId,
  savedBanIds,
  archiveToast,
  onTabChange,
  onClose,
  onSelectBan,
  onToggleSave,
}: Props) {
  const emptyMessage = bansTabEmptyMessage(tab);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!archiveToast) {
      setToastVisible(false);
      return;
    }
    setToastVisible(true);
    const timer = window.setTimeout(() => setToastVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [archiveToast]);

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
                saved={savedBanIds.has(ban.id)}
                onSelect={() => onSelectBan(ban)}
                onToggleSave={() => onToggleSave(ban)}
              />
            ))
          )}
        </div>
        {archiveToast && toastVisible ? (
          <div className="instant-ban-bans-overlay__toast" role="status">
            {archiveToast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
