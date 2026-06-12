'use client';

import type { ReactNode } from 'react';

type Props = {
  ring: ReactNode;
  hidden?: boolean;
  faceClassName?: string;
};

/** Shared lobby orb face — ring + 98+ center inside one subtree for boot scale. */
export function LobbyOrbFace({ ring, hidden = false, faceClassName = '' }: Props) {
  return (
    <span
      className={`instant-ban-arena-lobby-orb__face instant-ban-confirm-orb-face${
        hidden ? ' instant-ban-arena-lobby-orb__face--hidden' : ''
      }${faceClassName ? ` ${faceClassName}` : ''}`}
    >
      <span className="instant-ban-arena-lobby-orb__ring-layer instant-ban-confirm-orb-ring">
        {ring}
      </span>
      <span className="instant-ban-arena-lobby-orb__title-layer">
        <span className="lobby-screen__orb" data-orb-core>
          <span className="lobby-screen__title">98+</span>
        </span>
      </span>
    </span>
  );
}
