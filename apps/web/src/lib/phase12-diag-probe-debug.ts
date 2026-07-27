'use client';

import { isPhase12DiagEnabled } from '@/lib/phase12-diag-env-gate';
import { PHASE12_BUILD_MARKER } from '@/lib/phase12-build-marker';

export function logPhase12DiagBoot(): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: performance.now(),
    NEXT_PUBLIC_PHASE12_DIAG: PHASE12_BUILD_MARKER.diag,
    isPhase12DiagEnabled: isPhase12DiagEnabled(),
    NODE_ENV: PHASE12_BUILD_MARKER.nodeEnv,
    buildTimestamp: PHASE12_BUILD_MARKER.buildTimestamp,
    buildCommit: PHASE12_BUILD_MARKER.buildCommit,
    typeofWindow: typeof window,
  };
  console.log('[PHASE12 DIAG BOOT]', payload);
  window.__debug98log?.('[PHASE12 DIAG BOOT]', payload);
}

export function logPhase12TraceReached(
  site: string,
  phase: 'before-gate' | 'after-gate',
  extra: Record<string, unknown> = {},
): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: performance.now(),
    site,
    phase,
    NEXT_PUBLIC_PHASE12_DIAG: PHASE12_BUILD_MARKER.diag,
    isPhase12DiagEnabled: isPhase12DiagEnabled(),
    NODE_ENV: PHASE12_BUILD_MARKER.nodeEnv,
    buildTimestamp: PHASE12_BUILD_MARKER.buildTimestamp,
    buildCommit: PHASE12_BUILD_MARKER.buildCommit,
    typeofWindow: typeof window,
    ...extra,
  };
  console.log('[PHASE12 TRACE REACHED]', payload);
  window.__debug98log?.('[PHASE12 TRACE REACHED]', payload);
}
