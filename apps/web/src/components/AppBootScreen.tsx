'use client';

import { useEffect } from 'react';
import { LobbyIdleOrb } from '@/components/lobby/LobbyIdleOrb';
import { LobbyScreenAtmosphere } from '@/components/lobby/LobbyScreenAtmosphere';
import { primeLobbyRingIntroFromBoot } from '@/lib/lobby-ring-intro-session';
import './instant-ban/instant-ban.css';
import './lobby-screen.css';
import './app-boot-screen.css';

type Props = {
  /** Known influence 0–100; falls back to ambient boot level when unset/zero. */
  influencePercent: number;
};

const BOOT_AMBIENT_RING_PERCENT = 68;

function resolveBootRingTarget(influencePercent: number): number {
  if (!Number.isFinite(influencePercent) || influencePercent <= 0) {
    return BOOT_AMBIENT_RING_PERCENT;
  }
  return Math.min(100, Math.max(0, influencePercent));
}

/**
 * Deep-link / chrome-hidden boot placeholder — same lobby background + orb as InstantBanFlow.
 * Normal auth boot uses real InstantBanFlow chrome instead (no duplicate layer).
 */
export function AppBootScreen({ influencePercent }: Props) {
  const ringTarget = resolveBootRingTarget(influencePercent);

  useEffect(() => {
    primeLobbyRingIntroFromBoot(ringTarget);
  }, [ringTarget]);

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
        >
          <LobbyIdleOrb ringPercent={ringTarget} staticRing />
        </div>
      </div>
    </div>
  );
}
