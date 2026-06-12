'use client';

import { LobbyBootOrbWrap } from '@/components/lobby/LobbyBootOrbWrap';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { useBootSceneIntro } from '@/components/instant-ban/useBootSceneIntro';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './lobby-boot-intro.css';
import './boot-scene.css';

type Props = {
  influencePercent: number;
  energyKnown: boolean;
};

/**
 * Single boot entry scene — only place that runs orb scale + energy fill intro.
 */
export function BootScene({ influencePercent, energyKnown }: Props) {
  const ringTarget = Math.min(100, Math.max(0, influencePercent));

  const { introActive, bootFillActive, ringTargetPercent, onIntroEnd } =
    useBootSceneIntro(ringTarget, energyKnown);

  return (
    <div
      className={`boot-scene lobby-screen${
        introActive ? ' lobby-screen--boot-intro-active' : ''
      }`}
      data-boot-scene=""
      aria-hidden
    >
      <LobbyScreenAtmosphere />

      <div className="boot-scene__stage instant-ban-arena-send__stage">
        <LobbyBootOrbWrap
          className="lobby-screen__orb-wrap lobby-screen__orb-root"
          introActive={introActive}
          ringTarget={ringTargetPercent}
          onIntroEnd={onIntroEnd}
        >
          <LobbyIdleOrb
            ringPercent={ringTargetPercent}
            bootFillActive={bootFillActive}
          />
        </LobbyBootOrbWrap>
      </div>
    </div>
  );
}
