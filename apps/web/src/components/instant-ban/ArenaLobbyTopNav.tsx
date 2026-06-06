'use client';

type Props = {
  onOpenBans: () => void;
  bansNeedAttention?: boolean;
};

export function ArenaLobbyTopNav({
  onOpenBans,
  bansNeedAttention = false,
}: Props) {
  return (
    <nav
      className="instant-ban-arena-lobby-nav"
      aria-label="Навигация лобби"
    >
      <button
        type="button"
        className="instant-ban-arena-lobby-nav__item instant-ban-arena-lobby-nav__item--muted"
        disabled
        aria-disabled="true"
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
        onClick={onOpenBans}
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
