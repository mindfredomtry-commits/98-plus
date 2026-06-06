'use client';

import type { SyntheticEvent } from 'react';

/** Single geometry for filled + outline — prevents shift on toggle. */
const STAR_PATH =
  'M12 2.5l2.55 5.52 6.02.52-4.56 3.95 1.38 5.88L12 15.9l-5.39 3.47 1.38-5.88-4.56-3.95 6.02-.52L12 2.5z';

type Props = {
  banId: string;
  saved: boolean;
  onToggle: () => void;
};

export function BanSaveStar({ banId, saved, onToggle }: Props) {
  const stopBubble = (e: SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleActivate = (e: SyntheticEvent) => {
    stopBubble(e);
    console.info('[98+] ARCHIVE STAR CLICK', { banId, currentlySaved: saved });
    onToggle();
  };

  return (
    <button
      type="button"
      className={`instant-ban-bans-list-item__star${
        saved ? ' instant-ban-bans-list-item__star--saved' : ''
      }`}
      onClick={handleActivate}
      onPointerDown={stopBubble}
      onTouchStart={stopBubble}
      onMouseDown={stopBubble}
      aria-label={saved ? 'Убрать из архива' : 'Добавить в архив'}
      aria-pressed={saved}
      data-ban-id={banId}
      data-saved={saved ? 'true' : 'false'}
    >
      <svg
        className="instant-ban-bans-list-item__star-icon"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          d={STAR_PATH}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="instant-ban-bans-list-item__star-fill"
          data-active={saved ? 'true' : 'false'}
        />
        <path
          d={STAR_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="instant-ban-bans-list-item__star-outline"
          data-active={saved ? 'false' : 'true'}
        />
      </svg>
    </button>
  );
}
