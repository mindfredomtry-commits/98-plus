'use client';

import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './app-boot-screen.css';

/**
 * Deep-link boot veil — atmosphere only. Orb + intro live in InstantBanFlow when mounted.
 */
export function AppBootScreen() {
  return (
    <div
      className="app-boot-screen lobby-screen"
      data-app-boot-screen=""
      data-boot-part="root"
      aria-hidden
    >
      <LobbyScreenAtmosphere />
    </div>
  );
}
