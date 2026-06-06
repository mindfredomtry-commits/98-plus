'use client';

import type { SyntheticEvent } from 'react';

/**
 * Regular pentagram in 24×24: center (12, 12), top ray on vertical axis,
 * R = 9.5, r = R·sin(18°)/sin(54°).
 */
const STAR_PATH =
  'M12 2.5 L14.133 9.064 L21.035 9.064 L15.451 13.121 L17.584 19.686 L12 15.629 L6.416 19.686 L8.549 13.121 L2.965 9.064 L9.867 9.064 Z';

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
