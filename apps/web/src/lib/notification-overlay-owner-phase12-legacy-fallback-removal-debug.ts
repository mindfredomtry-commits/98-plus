'use client';

import { isPhase12DiagEnabled } from '@/lib/notification-overlay-owner-phase12-diag-gate';

export type Phase12LegacyFallbackRemovalLog = {
  source: string;
  ownerValue: unknown;
  legacyWouldValue: unknown;
  runtimeUsed: 'owner';
  mismatch: boolean;
  blockedReason?: string;
};

/** Phase 12.3B — owner-only runtime read; legacy logged, never used for behavior. */
export function logPhase12LegacyFallbackRemoval(
  data: Phase12LegacyFallbackRemovalLog,
): void {
  if (typeof window === 'undefined') return;
  if (!isPhase12DiagEnabled()) return;
  if (!data.mismatch) return;
  console.log('[PHASE12 LEGACY FALLBACK REMOVAL]', data);
  window.__debug98log?.('[PHASE12 LEGACY FALLBACK REMOVAL]', data);
}
