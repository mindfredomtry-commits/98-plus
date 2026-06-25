'use client';

import { logLobbyBansCtaClickTrace } from '@/lib/queue-source-comparison-debug';

type Props = {
  onOpenBans: () => void;
  onOpenSettings: () => void;
  bansNeedAttention?: boolean;
  settingsActive?: boolean;
  telegramUserId?: string | null;
};

export function ArenaLobbyTopNav({
  onOpenBans,
  onOpenSettings,
  bansNeedAttention = false,
  settingsActive = false,
  telegramUserId = null,
}: Props) {
  return (
    <nav
      className="instant-ban-arena-lobby-nav"
      aria-label="Навигация лобби"
    >
      <button
        type="button"
        className={`instant-ban-arena-lobby-nav__item${
          settingsActive
            ? ' instant-ban-arena-lobby-nav__item--active'
            : ' instant-ban-arena-lobby-nav__item--muted'
        }`}
        onClick={onOpenSettings}
        aria-label="Настройки"
      >
        Настройки
      </button>
      <button
        type="button"
        className={`instant-ban-arena-lobby-nav__item instant-ban-arena-lobby-nav__item--active${
          bansNeedAttention
            ? ' instant-ban-arena-lobby-nav__item--attention'
            : ''
        }`}
        onClick={() => {
          logLobbyBansCtaClickTrace({
            clickSurface: 'ArenaLobbyTopNav-button',
            clicked: true,
            telegramUserId,
            bansNeedAttention,
            showLobbyTopNav: true,
            ctaState: 'n/a-topnav',
            showLobbyCta: false,
            lobbyOpen: false,
            instantBanOpen: false,
            notificationChainTransitioning: false,
            notificationQueueUiLock: false,
            activeOverlayKind: null,
            willCallStartLobbyBansNotificationDrain: true,
            blockedReason: null,
          });
          onOpenBans();
        }}
        aria-label={
          bansNeedAttention
            ? 'Твои запреты — есть непрочитанные события'
            : 'Твои запреты'
        }
      >
        {bansNeedAttention ? (
          <span
            className="instant-ban-arena-lobby-nav__pending-dot"
            aria-hidden
          />
        ) : null}
        <span className="instant-ban-arena-lobby-nav__label">Твои запреты</span>
      </button>
      <button
        type="button"
        className="instant-ban-arena-lobby-nav__item instant-ban-arena-lobby-nav__item--muted"
        disabled
        aria-disabled="true"
      >
        Профиль
      </button>
    </nav>
  );
}
