'use client';

import { useMemo } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { AvatarImage } from '../AvatarImage';
import { BigButton } from '../BigButton';
import { userAvatarSrc } from '@/lib/user-public-avatar';
import {
  formatBanRemaining,
  useBanRemainingMs,
} from '@/lib/ban-remaining-time';
import { banHistoryStatusLabel, banStatusLabel } from './bans-overlay-utils';
import { BanSaveStar } from './BanSaveStar';
import { ResultShareIcon } from './ResultShareIcon';
import './instant-ban.css';

type Props = {
  ban: BanInteraction;
  viewerUserId?: string | null;
  isHistory?: boolean;
  saved?: boolean;
  onBack: () => void;
  onBanMore: () => void;
  onShare: () => void;
  onToggleSave?: () => void;
};

const BAN_MORE_LABEL_SENDER = '🚫 Запретить ещё раз!';
const BAN_MORE_LABEL_RECEIVER = '🚫 Запретить в ответ!';

function PartyAvatar({ user }: { user: BanInteraction['sender'] }) {
  const letter = (user?.firstName?.[0] ?? user?.username?.[0] ?? '?').toUpperCase();
  return (
    <div className="modal-avatar overflow-hidden" aria-hidden>
      <AvatarImage
        src={userAvatarSrc(user)}
        letter={letter}
        sizeClass="w-full h-full"
        textClass="text-lg"
      />
    </div>
  );
}

export function ActiveBanCardOverlay({
  ban,
  viewerUserId = null,
  isHistory = false,
  saved = false,
  onBack,
  onBanMore,
  onShare,
  onToggleSave,
}: Props) {
  const left = useBanRemainingMs(ban);

  const banMoreLabel = useMemo(() => {
    const isSender =
      viewerUserId != null
        ? ban.sender?.id === viewerUserId
        : !ban.isIncoming;
    return isSender ? BAN_MORE_LABEL_SENDER : BAN_MORE_LABEL_RECEIVER;
  }, [viewerUserId, ban.sender?.id, ban.isIncoming]);

  const view = useMemo(() => {
    const historyLabel = isHistory ? banHistoryStatusLabel(ban) : null;
    const headline =
      historyLabel ??
      (ban.status === 'active' ? 'запрещено' : banStatusLabel(ban.status));

    let footerText: string | null = null;
    if (!isHistory) {
      if (left != null) {
        footerText =
          left <= 0
            ? ban.status === 'checking'
              ? 'проверка'
              : '00:00'
            : formatBanRemaining(left, 'clock');
      } else {
        footerText = banStatusLabel(ban.status);
      }
    }

    return { headline, footerText };
  }, [ban, isHistory, left]);

  return (
    <div
      className="instant-ban-active-ban-card-layer"
      data-instant-ban-view="ActiveBanCardOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Карточка запрета"
    >
      <div className="instant-ban-active-ban-card-layer__dim" aria-hidden />
      <div className="modal-card modal-card--result instant-ban-active-ban-card">
        <div className="result-card-head">
          <button
            type="button"
            className="result-card-head__share"
            onClick={onShare}
            aria-label="Поделиться"
          >
            <ResultShareIcon />
          </button>
          {onToggleSave ? (
            <div className="result-card-head__archive">
              <BanSaveStar
                mode="toggle"
                banId={ban.id}
                saved={saved}
                onAction={onToggleSave}
              />
            </div>
          ) : null}
        </div>

        <div className="modal-card-body text-center result-card-body">
          <p className="result-headline text-2xl font-black text-glow mb-1">
            {view.headline}
          </p>
          <div className="mb-4" />

          <div className="result-compare mx-auto mb-4">
            <div className="result-party">
              <PartyAvatar user={ban.sender} />
            </div>
            <span className="result-arrow text-accent" aria-hidden>
              →
            </span>
            <div className="result-party">
              <PartyAvatar user={ban.receiver} />
            </div>
          </div>

          <p className="text-base font-semibold leading-snug mb-3 px-1">
            «{ban.text?.trim() || '—'}»
          </p>

          {view.footerText ? (
            <p className="result-energy text-2xl font-bold mb-1 text-accent">
              {view.footerText}
            </p>
          ) : null}
        </div>

        <div className="modal-card-actions result-card-actions space-y-2.5">
          <BigButton onClick={onBanMore}>{banMoreLabel}</BigButton>
          <BigButton variant="ghost" onClick={onBack}>
            К запретам
          </BigButton>
        </div>
      </div>
    </div>
  );
}
