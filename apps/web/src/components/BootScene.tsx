'use client';

import { useApp } from './Providers';
import { useBootSceneIntro } from '@/components/instant-ban/useBootSceneIntro';
import { useGlobalRelationshipOrb } from '@/lib/use-global-relationship-orb';
import { LobbyBootOrbWrap } from '@/components/lobby/LobbyBootOrbWrap';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { LobbyPersistentLogoSlot } from '@/components/lobby/LobbyPersistentLogoSlot';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './lobby-boot-intro.css';
import './boot-scene.css';

type Props = {
  influencePercent: number;
  energyKnown: boolean;
};

/** Standalone boot scene fallback — same launch phases as InstantBanFlow. */
export function BootScene({ influencePercent, energyKnown }: Props) {
  const { token } = useApp();
  const globalRelationshipRing = useGlobalRelationshipOrb(token);
  const ringTarget = Math.min(100, Math.max(0, influencePercent));

  const {
    logoScaleActive,
    ringScaleActive,
    fillActive,
    logoLocked,
    ringScaleLocked,
    bootIntroActive,
    fillTargetPercent,
    onLogoScaleEnd,
    onRingScaleEnd,
    onFillEnd,
    logoScaleMs,
    logoScaleDelayMs,
    ringScaleMs,
    fillMs,
  } = useBootSceneIntro(ringTarget, energyKnown);

  return (
    <div
      className={`boot-scene lobby-screen instant-ban-flow${
        bootIntroActive ? ' lobby-screen--boot-intro-active' : ''
      }`}
      data-boot-scene=""
      aria-hidden
    >
      <LobbyScreenAtmosphere />

      <div className="boot-scene__stage instant-ban-arena-send__stage">
        <LobbyPersistentLogoSlot
          key="lobby-persistent-logo"
          logoScaleActive={logoScaleActive}
          logoLocked={logoLocked}
          visible
          logoScaleMs={logoScaleMs}
          logoScaleDelayMs={logoScaleDelayMs}
          onLogoScaleEnd={onLogoScaleEnd}
        />
        <LobbyBootOrbWrap
          className="lobby-screen__orb-wrap lobby-screen__orb-root"
          ringScaleActive={ringScaleActive}
          fillActive={fillActive}
          ringScaleLocked={ringScaleLocked}
          ringTarget={fillTargetPercent}
          ringScaleMs={ringScaleMs}
          fillMs={fillMs}
          onRingScaleEnd={onRingScaleEnd}
          onFillEnd={onFillEnd}
        >
          <LobbyIdleOrb ringState={globalRelationshipRing} hideTitle />
        </LobbyBootOrbWrap>
      </div>
    </div>
  );
}
