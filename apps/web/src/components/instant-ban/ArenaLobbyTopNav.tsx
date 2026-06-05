'use client';

type Props = {
  onOpenBans: () => void;
};

export function ArenaLobbyTopNav({ onOpenBans }: Props) {
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
        className="instant-ban-arena-lobby-nav__item instant-ban-arena-lobby-nav__item--active"
        onClick={onOpenBans}
      >
        Твои запреты
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
