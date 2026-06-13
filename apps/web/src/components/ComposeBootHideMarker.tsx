'use client';

import { useLayoutEffect } from 'react';

type Props = {
  active: boolean;
};

/** Marks html[data-hide-boot-visual-for-compose] — boot layers must not cover compose screens. */
export function ComposeBootHideMarker({ active }: Props) {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (active) {
      document.documentElement.dataset.hideBootVisualForCompose = 'true';
    } else {
      delete document.documentElement.dataset.hideBootVisualForCompose;
    }
  }, [active]);

  return null;
}
