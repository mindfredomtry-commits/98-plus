'use client';

import type { SyntheticEvent } from 'react';

/**
 * Soft pentagram in 24×24: center (12, 12), top ray on vertical axis.
 * Shorter tips (R = 8) and shallower valleys (r = 6.2) for a compact shape.
 */
const STAR_PATH =
  'M12 4 L15.644 6.984 L19.608 9.528 L17.897 13.916 L16.702 18.472 L12 18.2 L7.298 18.472 L6.103 13.916 L4.392 9.528 L8.356 6.984 Z';

const STAR_STROKE_WIDTH = 0.8;

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
          strokeWidth={STAR_STROKE_WIDTH}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="instant-ban-bans-list-item__star-fill"
          data-active={saved ? 'true' : 'false'}
        />
        <path
          d={STAR_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={STAR_STROKE_WIDTH}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="instant-ban-bans-list-item__star-outline"
          data-active={saved ? 'false' : 'true'}
        />
      </svg>
    </button>
  );
}
