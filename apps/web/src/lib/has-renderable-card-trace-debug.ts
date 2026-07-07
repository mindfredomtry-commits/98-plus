'use client';

import type { EmptyHostBugQueueItemSnapshot } from './empty-host-bug-trace-debug';

export type HasRenderableCardTrace = {
  shellKind: string | null;
  queueHeadKind: string | null;
  ownerPrimaryDisplayResultForShell: string | null;
  renderableResultShell: boolean;
  queueResultOverlayClaimed: boolean;
  ownerDisplayResult: string | null;
  ownerQueueHead: EmptyHostBugQueueItemSnapshot;
  selectedResult: string | null;
  finalHasRenderableCard: boolean;
  decisionReason: string;
  hasRenderableResultFromDisplay: boolean;
  hasRenderableResultFromShellClaim: boolean;
  hasRenderableResultFromRenderableShell: boolean;
};

export function logHasRenderableCardTrace(trace: HasRenderableCardTrace): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('HAS_RENDERABLE_CARD_TRACE', payload);
  window.__debug98log?.('HAS_RENDERABLE_CARD_TRACE', payload);
}

export function resolveHasRenderableCardDecisionReason(input: {
  finalHasRenderableCard: boolean;
  showDirectOverboardLayer: boolean;
  checkOverlayMounted: boolean;
  hasStableIncoming: boolean;
  hasCheckCard: boolean;
  hasRenderableResultFromDisplay: boolean;
  hasRenderableResultFromShellClaim: boolean;
  hasRenderableResultFromRenderableShell: boolean;
  hasIncomingCard: boolean;
}): string {
  if (input.finalHasRenderableCard) {
    if (input.showDirectOverboardLayer) return 'direct-overboard-layer';
    if (input.checkOverlayMounted) return 'check-overlay-mounted';
    if (input.hasStableIncoming) return 'stable-incoming-ban';
    if (input.hasCheckCard) return 'check-shell-ban';
    if (input.hasRenderableResultFromRenderableShell) {
      return 'renderable-result-shell';
    }
    if (input.hasRenderableResultFromShellClaim) {
      return 'queue-result-overlay-claimed';
    }
    if (input.hasRenderableResultFromDisplay) {
      return 'owner-primary-display-result-for-shell';
    }
    if (input.hasIncomingCard) return 'incoming-card-ready';
    return 'renderable-true-unknown';
  }
  if (input.hasRenderableResultFromShellClaim && !input.finalHasRenderableCard) {
    return 'result-claim-ignored-before-fix';
  }
  if (input.hasRenderableResultFromRenderableShell && !input.finalHasRenderableCard) {
    return 'renderable-result-shell-ignored-before-fix';
  }
  return 'no-renderable-card';
}
