'use client';

import { isPhase12DiagEnabled } from '@/lib/notification-overlay-owner-phase12-smoke-env';

export function logPhase12DiagBoot(): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: performance.now(),
    NEXT_PUBLIC_PHASE12_DIAG: process.env.NEXT_PUBLIC_PHASE12_DIAG ?? null,
    isPhase12DiagEnabled: isPhase12DiagEnabled(),
    NODE_ENV: process.env.NODE_ENV ?? null,
    buildTimestamp: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? null,
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
    NEXT_PUBLIC_PHASE12_DIAG: process.env.NEXT_PUBLIC_PHASE12_DIAG ?? null,
    isPhase12DiagEnabled: isPhase12DiagEnabled(),
    NODE_ENV: process.env.NODE_ENV ?? null,
    buildTimestamp: process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? null,
    typeofWindow: typeof window,
    ...extra,
  };
  console.log('[PHASE12 TRACE REACHED]', payload);
  window.__debug98log?.('[PHASE12 TRACE REACHED]', payload);
}
