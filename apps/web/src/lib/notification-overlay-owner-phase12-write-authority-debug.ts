'use client';

import type { Phase12WriteAuthoritySnapshot } from '@/lib/notification-overlay-owner-phase12-write-authority';
import { isPhase12DiagEnabled } from '@/lib/notification-overlay-owner-phase12-diag-gate';

export type Phase12WriteAuthorityLog = {
  operation: string;
  ownerBefore: Phase12WriteAuthoritySnapshot;
  ownerAfter: Phase12WriteAuthoritySnapshot;
  legacyBefore: Phase12WriteAuthoritySnapshot;
  legacyAfter: Phase12WriteAuthoritySnapshot;
  mirrorApplied: boolean;
  mismatch: boolean;
};

/** Phase 12.2B — owner write authority vs legacy mirror compare. */
export function logPhase12WriteAuthority(data: Phase12WriteAuthorityLog): void {
  if (typeof window === 'undefined') return;
  if (!isPhase12DiagEnabled()) return;
  console.log('[PHASE12 WRITE AUTHORITY]', data);
  window.__debug98log?.('[PHASE12 WRITE AUTHORITY]', data);
}
