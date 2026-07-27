'use client';

import type { Phase12ParityCheckPayload } from '@/lib/notification-overlay-owner-phase12-parity';
import {
  ensurePhase12ParityCountersInitialized,
  isPhase12DiagEnabled,
  type Phase12ParityCounters,
} from '@/lib/notification-overlay-owner-phase12-diag-gate';

export type { Phase12ParityCounters };

function bumpParityCounters(payload: Phase12ParityCheckPayload): void {
  if (typeof window === 'undefined') return;
  ensurePhase12ParityCountersInitialized();
  const prev = window.__phase12ParityCounters ?? {
    checks: 0,
    mismatches: 0,
    mirrorLagResolved: 0,
    fallbackUsed: 0,
  };
  const next: Phase12ParityCounters = {
    checks: prev.checks + 1,
    mismatches: prev.mismatches + (payload.mismatch ? 1 : 0),
    mirrorLagResolved:
      prev.mirrorLagResolved +
      (!payload.mismatch && payload.mirrorLagFrames > 0 ? 1 : 0),
    fallbackUsed: prev.fallbackUsed + (payload.fallbackUsed ? 1 : 0),
  };
  window.__phase12ParityCounters = next;
}

/** Phase 12.2C — owner vs legacy mirror parity after owner commit. */
export function logPhase12ParityCheck(payload: Phase12ParityCheckPayload): void {
  if (typeof window === 'undefined') return;
  if (!isPhase12DiagEnabled()) return;
  bumpParityCounters(payload);
  console.log('[PHASE12 PARITY CHECK]', payload);
  window.__debug98log?.('[PHASE12 PARITY CHECK]', payload);
}

if (typeof window !== 'undefined') {
  ensurePhase12ParityCountersInitialized();
}
