'use client';

import { LobbyBootOrbWrap } from '@/components/lobby/LobbyBootOrbWrap';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { useLobbyBootIntro } from '@/components/instant-ban/useLobbyBootIntro';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './lobby-boot-intro.css';
import './app-boot-screen.css';

type Props = {
  influencePercent: number;
  energyKnown: boolean;
};

/**
 * Deep-link / chrome-hidden boot placeholder — same lobby background + orb as InstantBanFlow.
 */
export function AppBootScreen({ influencePercent, energyKnown }: Props) {
  const ringTarget = Math.min(100, Math.max(0, influencePercent));

  const {
    ringDisplayPercent,
    ringTarget: ringTargetCss,
    introActive,
    bootIntroActive,
    introPrimed,
    scaleIntroActive,
    scalePending,
    scaleDone,
    ringBootBaseActive,
    ringIntroActive,
    bootCssFillActive,
    ringCatchupActive,
    onScaleAnimationEnd,
    onRingAnimationEnd,
  } = useLobbyBootIntro(ringTarget, {
    phase: 'idle',
    sendStarted: false,
    energyKnown,
    enabled: true,
  });

  return (
    <div
      className={`app-boot-screen lobby-screen${
        introActive ? ' lobby-screen--boot-intro-active' : ''
      }`}
      data-app-boot-screen=""
      data-boot-part="root"
      aria-hidden
    >
      <LobbyScreenAtmosphere />

      <div className="app-boot-screen__stage" data-boot-part="extra">
        <LobbyBootOrbWrap
          className="lobby-screen__orb-wrap lobby-screen__orb-root"
          bootIntroActive={bootIntroActive}
          introPrimed={introPrimed}
          scalePending={scalePending}
          scaleActive={scaleIntroActive}
          scaleDone={scaleDone}
          ringBaseActive={ringBootBaseActive}
          ringActive={ringIntroActive}
          ringCatchupActive={ringCatchupActive}
          ringTarget={ringTargetCss}
          onScaleAnimationEnd={onScaleAnimationEnd}
          onRingAnimationEnd={onRingAnimationEnd}
        >
          <LobbyIdleOrb
            ringPercent={ringDisplayPercent}
            ringCatchupActive={ringCatchupActive}
            bootCssFillActive={bootCssFillActive}
          />
        </LobbyBootOrbWrap>
      </div>
    </div>
  );
}
