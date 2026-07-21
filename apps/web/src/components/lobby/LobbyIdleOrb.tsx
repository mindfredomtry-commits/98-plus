'use client';

import { GlobalRelationshipRing } from '@/components/lobby/GlobalRelationshipRing';
import { LobbyOrbFace } from '@/components/lobby/LobbyOrbFace';
import type { GlobalRelationshipOrbRingState } from '@/lib/use-global-relationship-orb';

type Props = {
  ringState: GlobalRelationshipOrbRingState;
  /** Boot ring slot — 98+ logo is rendered in LobbyBootOrbWrap overlay. */
  hideTitle?: boolean;
};

/**
 * Idle lobby orb shell — same DOM/CSS as ArenaLobbyOrb lobby face, no interactions.
 * Ring fill is Global Relationship Orb (not energy).
 */
export function LobbyIdleOrb({ ringState, hideTitle = false }: Props) {
  return (
    <div className="instant-ban-arena-lobby-orb" data-arena-lobby-orb>
      <div className="instant-ban-arena-lobby-orb__stage">
        <div className="instant-ban-arena-lobby-orb__btn">
          <LobbyOrbFace
            hideTitle={hideTitle}
            ring={
              <GlobalRelationshipRing
                ringState={ringState}
                className="instant-ban-confirm-influence-ring"
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
