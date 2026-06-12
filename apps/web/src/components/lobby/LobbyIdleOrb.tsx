'use client';

import { InfluenceRing } from '@/components/lobby/InfluenceRing';
import { LobbyOrbFace } from '@/components/lobby/LobbyOrbFace';

type Props = {
  ringPercent: number;
  ringCatchupActive?: boolean;
  bootCssFillActive?: boolean;
};

/**
 * Idle lobby orb shell — same DOM/CSS as ArenaLobbyOrb lobby face, no interactions.
 */
export function LobbyIdleOrb({
  ringPercent,
  ringCatchupActive = false,
  bootCssFillActive = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, ringPercent));

  return (
    <div className="instant-ban-arena-lobby-orb" data-arena-lobby-orb>
      <div className="instant-ban-arena-lobby-orb__stage">
        <div className="instant-ban-arena-lobby-orb__btn">
          <LobbyOrbFace
            ring={
              <InfluenceRing
                value={clamped}
                className="instant-ban-confirm-influence-ring"
                disableTransition={!ringCatchupActive}
                bootCssFillActive={bootCssFillActive}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
