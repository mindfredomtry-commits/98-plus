'use client';

import type { CSSProperties } from 'react';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { useLobbyBootIntro } from '@/components/instant-ban/useLobbyBootIntro';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './app-boot-screen.css';

type Props = {
  influencePercent: number;
  energyKnown: boolean;
};

/**
 * Deep-link / chrome-hidden boot placeholder — same lobby background + orb as InstantBanFlow.
 * Normal auth boot uses real InstantBanFlow chrome instead (no duplicate layer).
 */
export function AppBootScreen({ influencePercent, energyKnown }: Props) {
  const ringTarget = Math.min(100, Math.max(0, influencePercent));

  const { orbScale, ringDisplayPercent, isFilling } = useLobbyBootIntro(
    ringTarget,
    {
      phase: 'idle',
      sendStarted: false,
      energyKnown,
      enabled: true,
    },
  );

  const orbWrapStyle = {
    transform: `translate(-50%, -50%) scale(${orbScale})`,
  } as CSSProperties;

  return (
    <div
      className="app-boot-screen lobby-screen"
      data-app-boot-screen=""
      data-boot-part="root"
      aria-hidden
    >
      <LobbyScreenAtmosphere />

      <div className="app-boot-screen__stage" data-boot-part="extra">
        <div
          className="lobby-screen__orb-wrap lobby-screen__orb-root"
          data-orb-root
          data-boot-part="orb"
          style={orbWrapStyle}
        >
          <LobbyIdleOrb
            ringPercent={ringDisplayPercent}
            ringIntroFilling={isFilling}
          />
        </div>
      </div>
    </div>
  );
}
