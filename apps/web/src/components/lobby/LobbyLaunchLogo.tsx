'use client';

import { forwardRef } from 'react';

/** Boot launch logo — isolated from arena orb title-layer selectors. */
export const LobbyLaunchLogo = forwardRef<HTMLSpanElement>(function LobbyLaunchLogo(
  _props,
  ref,
) {
  return (
    <span className="lobby-boot-logo-layer__inner">
      <span className="lobby-screen__orb" data-orb-core>
        <span
          ref={ref}
          className="lobby-screen__title"
          data-logo-source="persistent"
        >
          98+
        </span>
      </span>
    </span>
  );
});
