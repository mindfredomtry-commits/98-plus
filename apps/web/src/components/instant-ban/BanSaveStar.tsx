'use client';

import type { SyntheticEvent } from 'react';
import { BanGlyph } from './SuccessBanCardBody';

/** Same thick stroke as success card — reads as filled prohibition mark. */
const ARCHIVE_GLYPH_FILL_STROKE = 2.75;
/** Thin outline for unsaved archive state. */
const ARCHIVE_GLYPH_OUTLINE_STROKE = 0.8;

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
    console.info('[98+] ARCHIVE ICON CLICK', { banId, currentlySaved: saved });
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
      <span className="instant-ban-bans-list-item__star-icon" aria-hidden>
        <span
          className="instant-ban-bans-list-item__ban-glyph-fill"
          data-active={saved ? 'true' : 'false'}
        >
          <BanGlyph strokeWidth={ARCHIVE_GLYPH_FILL_STROKE} />
        </span>
        <span
          className="instant-ban-bans-list-item__ban-glyph-outline"
          data-active={saved ? 'false' : 'true'}
        >
          <BanGlyph strokeWidth={ARCHIVE_GLYPH_OUTLINE_STROKE} />
        </span>
      </span>
    </button>
  );
}
