'use client';

import { useLayoutEffect } from 'react';

/** Sets html[data-app-hydrated] after first client commit — unlocks post-hydration CSS gates. */
export function AppHydrationMarker() {
  useLayoutEffect(() => {
    document.documentElement.dataset.appHydrated = 'true';
  }, []);

  return null;
}
