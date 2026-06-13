'use client';

import type { ReactNode } from 'react';

type Props = {
  ring: ReactNode;
  hidden?: boolean;
  faceClassName?: string;
  /** Suppress orb-face title — persistent logo owns 98+ in lobby idle/boot handoff. */
  hideTitle?: boolean;
};

/** Shared lobby orb face — ring + optional 98+ center. */
export function LobbyOrbFace({
  ring,
  hidden = false,
  faceClassName = '',
  hideTitle = false,
}: Props) {
  return (
    <span
      className={`instant-ban-arena-lobby-orb__face instant-ban-confirm-orb-face${
        hidden ? ' instant-ban-arena-lobby-orb__face--hidden' : ''
      }${faceClassName ? ` ${faceClassName}` : ''}`}
      data-lobby-title-suppressed={hideTitle ? 'true' : undefined}
    >
      <span className="instant-ban-arena-lobby-orb__ring-layer instant-ban-confirm-orb-ring">
        {ring}
      </span>
      {hideTitle ? null : (
        <span className="instant-ban-arena-lobby-orb__title-layer">
          <span className="lobby-screen__orb" data-orb-core>
            <span className="lobby-screen__title" data-logo-source="orb-face">
              98+
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
