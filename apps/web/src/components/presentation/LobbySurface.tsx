'use client';

import type { ReactNode } from 'react';

/** Exclusive Lobby root — orb, logo, CTA, chrome only live here. */
export function LobbySurface({ children }: { children: ReactNode }) {
  return (
    <div data-presentation-surface="lobby" data-testid="presentation-lobby">
      {children}
    </div>
  );
}
