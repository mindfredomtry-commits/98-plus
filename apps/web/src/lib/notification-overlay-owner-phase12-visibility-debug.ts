'use client';

export type Phase12VisibilityPayloadKind =
  | 'check'
  | 'incoming'
  | 'result'
  | 'direct-result'
  | 'shell';

export type Phase12VisibilityGateLog = {
  component: string;
  ownerVisible: boolean;
  legacyWouldVisible: boolean;
  mismatch: boolean;
  reason: string;
  payloadKind: Phase12VisibilityPayloadKind;
  banId?: string | null;
  resultId?: string | null;
  source: string;
};

/** Phase 12.1b — owner vs legacy visibility gate compare. */
export function logPhase12VisibilityGate(data: Phase12VisibilityGateLog): void {
  if (typeof window === 'undefined') return;
  console.log('[PHASE12 VISIBILITY GATE]', data);
  window.__debug98log?.('[PHASE12 VISIBILITY GATE]', data);
}

export function logPhase12VisibilityGateIfMismatch(
  data: Phase12VisibilityGateLog,
): void {
  logPhase12VisibilityGate(data);
  if (data.mismatch && process.env.NODE_ENV !== 'production') {
    console.warn('[PHASE12 VISIBILITY GATE MISMATCH]', data);
  }
}
