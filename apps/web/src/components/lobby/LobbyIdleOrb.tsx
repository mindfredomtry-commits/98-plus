'use client';

import { InfluenceRing } from '@/components/lobby/InfluenceRing';

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
          <span className="instant-ban-arena-lobby-orb__face">
            <span className="instant-ban-arena-lobby-orb__ring-layer instant-ban-confirm-orb-ring">
              <InfluenceRing
                value={clamped}
                className="instant-ban-confirm-influence-ring"
                disableTransition={!ringCatchupActive}
                bootCssFillActive={bootCssFillActive}
              />
            </span>
            <span className="instant-ban-arena-lobby-orb__title-layer">
              <span className="lobby-screen__orb" data-orb-core>
                <span className="lobby-screen__title">98+</span>
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
