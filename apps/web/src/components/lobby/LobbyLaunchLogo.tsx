'use client';

import { forwardRef } from 'react';

type Props = {
  /** boot during logoEnter only; persistent after logoEnterDone. */
  logoSource?: 'boot' | 'persistent';
};

/** Boot launch logo — isolated from arena orb title-layer selectors. */
export const LobbyLaunchLogo = forwardRef<HTMLSpanElement, Props>(function LobbyLaunchLogo(
  { logoSource = 'persistent' },
  ref,
) {
  return (
    <span className="lobby-boot-logo-layer__inner">
      <span className="lobby-screen__orb" data-orb-core>
        <span ref={ref} className="lobby-screen__title" data-logo-source={logoSource}>
          98+
        </span>
      </span>
    </span>
  );
});
