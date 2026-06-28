'use client';

export type Phase12DecisionReadLog = {
  component: string;
  decision: string;
  ownerDecision: unknown;
  legacyDecision: unknown;
  mismatch: boolean;
  banId?: string | null;
  resultId?: string | null;
  queueHead?: string | null;
  reason: string;
};

/** Phase 12.2A — owner vs legacy decision read compare. */
export function logPhase12DecisionRead(data: Phase12DecisionReadLog): void {
  if (typeof window === 'undefined') return;
  console.log('[PHASE12 DECISION READ]', data);
  window.__debug98log?.('[PHASE12 DECISION READ]', data);
}
