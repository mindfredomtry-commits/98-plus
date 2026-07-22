'use client';

import { RelationshipRingPrimitive } from '@/components/lobby/RelationshipRingPrimitive';
import type { GlobalRelationshipOrbRingState } from '@/lib/use-global-relationship-orb';

type Props = {
  ringState: GlobalRelationshipOrbRingState;
  /** Confirm-hold fill 0..1 (not energy). */
  holdProgress?: number;
  className?: string;
};

/**
 * Lobby / confirm Global Relationship Orb ring.
 * Thin adapter over RelationshipRingPrimitive — same geometry everywhere.
 */
export function GlobalRelationshipRing({
  ringState,
  holdProgress = 0,
  className = '',
}: Props) {
  const available = ringState.status === 'available';

  return (
    <RelationshipRingPrimitive
      viewerShare={available ? ringState.viewerShare : null}
      otherShare={available ? ringState.otherShare : null}
      neutral={!available}
      holdProgress={holdProgress}
      className={`global-relationship-ring${className ? ` ${className}` : ''}`}
    />
  );
}
