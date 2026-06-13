'use client';

import { useLayoutEffect } from 'react';

type Props = {
  active: boolean;
};

/** html[data-hide-lobby-boot-logo-only] — prehydrate/early logo only, not orbs. */
export function LobbyBootLogoHideMarker({ active }: Props) {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (active) {
      document.documentElement.dataset.hideLobbyBootLogoOnly = 'true';
    } else {
      delete document.documentElement.dataset.hideLobbyBootLogoOnly;
    }
  }, [active]);

  return null;
}
