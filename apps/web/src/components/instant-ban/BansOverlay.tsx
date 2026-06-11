'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';

const TABS: { id: BansTab; label: string }[] = [
  { id: 'yours', label: 'Твои' },
  { id: 'toYou', label: 'Тебе' },
  { id: 'history', label: 'История' },
  { id: 'archive', label: 'Архив' },
];

const ARCHIVE_LONG_PRESS_MS = 500;

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
  onRepeatBan: (ban: BanInteraction) => void;
  onRemoveFromArchive: (ban: BanInteraction) => void;
  onDeleteModeEnter: () => void;
};

function BanListItem({
  ban,
  tab,
  userId,
  saved,
  deleteMode,
  onSelect,
  onToggleSave,
  onRepeatBan,
  onRemoveFromArchive,
  onEnterDeleteMode,
}: {
  ban: BanInteraction;
  tab: BansTab;
  userId: string | undefined;
  saved: boolean;
  deleteMode: boolean;
  onSelect: () => void;
  onToggleSave: () => void;
  onRepeatBan: () => void;
  onRemoveFromArchive: () => void;
  onEnterDeleteMode: () => void;
}) {
  const opponent = opponentForBan(ban, userId);
  const left = useBanRemainingMs(ban);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const useOutcomeLabel =
    tab === 'history' || (tab === 'archive' && isBanTerminal(ban.status));
  const timerText =
    left != null
      ? formatBanRemaining(left, 'compact')
      : useOutcomeLabel
        ? banHistoryStatusLabel(ban)
        : banStatusLabel(ban.status);
  const isArchiveTab = tab === 'archive';

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleMainPointerDown = useCallback(() => {
    if (!isArchiveTab || deleteMode) return;
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onEnterDeleteMode();
    }, ARCHIVE_LONG_PRESS_MS);
  }, [clearLongPressTimer, deleteMode, isArchiveTab, onEnterDeleteMode]);

  const handleMainPointerEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleMainClick = useCallback(() => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onSelect();
  }, [onSelect]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const iconProps = isArchiveTab
    ? deleteMode
      ? {
          mode: 'delete' as const,
          banId: ban.id,
          onAction: onRemoveFromArchive,
        }
      : {
          mode: 'archive-mark' as const,
          banId: ban.id,
        }
    : {
        mode: 'toggle' as const,
        banId: ban.id,
        saved,
        onAction: onToggleSave,
      };

  return (
    <div
      className={`instant-ban-bans-list-item${
        deleteMode ? ' instant-ban-bans-list-item--delete-mode' : ''
      }`}
    >
      <button
        type="button"
        className="instant-ban-bans-list-item__main"
        onClick={handleMainClick}
        onPointerDown={handleMainPointerDown}
        onPointerUp={handleMainPointerEnd}
        onPointerLeave={handleMainPointerEnd}
        onPointerCancel={handleMainPointerEnd}
        onContextMenu={(e) => {
          if (isArchiveTab) e.preventDefault();
        }}
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
      <BanSaveStar {...iconProps} />
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
  onRepeatBan,
  onRemoveFromArchive,
  onDeleteModeEnter,
}: Props) {
  const emptyMessage = bansTabEmptyMessage(tab);
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteModeBanId, setDeleteModeBanId] = useState<string | null>(null);

  useEffect(() => {
    setDeleteModeBanId(null);
  }, [tab]);

  useEffect(() => {
    if (!archiveToast) {
      setToastVisible(false);
      return;
    }
    setToastVisible(true);
    const timer = window.setTimeout(() => setToastVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [archiveToast]);

  const handleTabChange = useCallback(
    (nextTab: BansTab) => {
      setDeleteModeBanId(null);
      onTabChange(nextTab);
    },
    [onTabChange],
  );

  const handleSelectBan = useCallback(
    (ban: BanInteraction) => {
      setDeleteModeBanId(null);
      onSelectBan(ban);
    },
    [onSelectBan],
  );

  const handleEnterDeleteMode = useCallback(
    (banId: string) => {
      setDeleteModeBanId(banId);
      onDeleteModeEnter();
    },
    [onDeleteModeEnter],
  );

  const handleRemoveFromArchive = useCallback(
    (ban: BanInteraction) => {
      setDeleteModeBanId(null);
      onRemoveFromArchive(ban);
    },
    [onRemoveFromArchive],
  );

  const handleBackClick = useCallback(() => {
    console.log('[BANS BACK CLICK]');
    markVisibleOverboardTrace('[BANS BACK CLICK]', {});
    onClose();
  }, [onClose]);

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
              onClick={handleBackClick}
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
                onClick={() => handleTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="instant-ban-bans-overlay__list"
          role="tabpanel"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteModeBanId(null);
            }
          }}
        >
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
                deleteMode={tab === 'archive' && deleteModeBanId === ban.id}
                onSelect={() => handleSelectBan(ban)}
                onToggleSave={() => onToggleSave(ban)}
                onRepeatBan={() => onRepeatBan(ban)}
                onRemoveFromArchive={() => handleRemoveFromArchive(ban)}
                onEnterDeleteMode={() => handleEnterDeleteMode(ban.id)}
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
