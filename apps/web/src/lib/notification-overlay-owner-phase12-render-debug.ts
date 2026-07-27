'use client';

/** Phase 12.1 — render-path fallback suppressed; legacy would have been used. */
export function logPhase12RenderFallback(data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  console.log('[PHASE12 RENDER FALLBACK]', data);
  window.__debug98log?.('[PHASE12 RENDER FALLBACK]', data);
}
