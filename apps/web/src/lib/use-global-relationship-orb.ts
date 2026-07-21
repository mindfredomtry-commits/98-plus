import { useEffect, useState } from 'react';
import { resolveGlobalRelationshipShare } from '@98plus/shared';
import { fetchRelationshipOverview } from '@/lib/relationship-analytics-api';
import { extractOverviewDimensions } from '@/lib/relationship-dimensions';
import type { RelationshipOverviewRangeCode } from '@/lib/relationship-analytics-types';

/** Same default as AnalyticsPeerSelectScreen (`selectedRange` initial value). */
export const GLOBAL_RELATIONSHIP_OVERVIEW_RANGE: RelationshipOverviewRangeCode =
  'ALL';

export type GlobalRelationshipOrbRingState =
  | { status: 'loading' }
  | {
      status: 'available';
      viewerShare: number;
      otherShare: number;
      contributingMetrics: number;
      totalSampleSize: number;
    }
  | { status: 'low-data' }
  | { status: 'error' };

/**
 * Loads overview once and resolves the home Global Relationship Orb ring.
 * Independent of energy / influencePercent (CTA gate).
 */
export function useGlobalRelationshipOrb(
  token: string | null | undefined,
): GlobalRelationshipOrbRingState {
  const [state, setState] = useState<GlobalRelationshipOrbRingState>({
    status: 'loading',
  });

  useEffect(() => {
    if (!token) {
      setState({ status: 'loading' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    fetchRelationshipOverview({
      token,
      range: GLOBAL_RELATIONSHIP_OVERVIEW_RANGE,
    })
      .then((payload) => {
        if (cancelled) return;
        const dimensions = extractOverviewDimensions(payload);
        const resolved = resolveGlobalRelationshipShare(dimensions);
        if (resolved.status === 'available') {
          setState({
            status: 'available',
            viewerShare: resolved.viewerShare,
            otherShare: resolved.otherShare,
            contributingMetrics: resolved.contributingMetrics,
            totalSampleSize: resolved.totalSampleSize,
          });
          return;
        }
        setState({ status: 'low-data' });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
