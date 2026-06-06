'use client';

import type { SyntheticEvent } from 'react';
import { BanGlyph } from './SuccessBanCardBody';

/** Same thick stroke as success card — reads as filled prohibition mark. */
const ARCHIVE_GLYPH_FILL_STROKE = 2.75;
/** Thin outline for unsaved archive state. */
const ARCHIVE_GLYPH_OUTLINE_STROKE = 0.8;

type ToggleProps = {
  mode: 'toggle';
  banId: string;
  saved: boolean;
  onAction: () => void;
};

type RepeatProps = {
  mode: 'repeat';
  banId: string;
  onAction: () => void;
};

type DeleteProps = {
  mode: 'delete';
  banId: string;
  onAction: () => void;
};

type Props = ToggleProps | RepeatProps | DeleteProps;

function TrashGlyph({ strokeWidth = 0.8 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h8M6 6h12M9 6V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M10 10v7M14 10v7M7 6l1 14h8l1-14"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BanSaveStar(props: Props) {
  const { banId, mode, onAction } = props;

  const stopBubble = (e: SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleActivate = (e: SyntheticEvent) => {
    stopBubble(e);
    console.info('[98+] ARCHIVE ICON CLICK', {
      banId,
      mode,
      saved: mode === 'toggle' ? props.saved : undefined,
    });
    onAction();
  };

  const saved = mode === 'toggle' ? props.saved : mode === 'repeat';
  const isDelete = mode === 'delete';

  return (
    <button
      type="button"
      className={`instant-ban-bans-list-item__star${
        saved ? ' instant-ban-bans-list-item__star--saved' : ''
      }${isDelete ? ' instant-ban-bans-list-item__star--delete' : ''}`}
      onClick={handleActivate}
      onPointerDown={stopBubble}
      onTouchStart={stopBubble}
      onMouseDown={stopBubble}
      aria-label={
        mode === 'delete'
          ? 'Удалить из архива'
          : mode === 'repeat'
            ? 'Запретить ещё раз'
            : props.saved
              ? 'Убрать из архива'
              : 'Добавить в архив'
      }
      aria-pressed={mode === 'toggle' ? props.saved : undefined}
      data-ban-id={banId}
      data-archive-icon-mode={mode}
      data-saved={saved ? 'true' : 'false'}
    >
      <span className="instant-ban-bans-list-item__star-icon" aria-hidden>
        {isDelete ? (
          <TrashGlyph strokeWidth={ARCHIVE_GLYPH_OUTLINE_STROKE} />
        ) : (
          <>
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
          </>
        )}
      </span>
    </button>
  );
}
