import {
  isPhase12DiagEnabled,
  PHASE12_TELEGRAM_FRAME_ANCESTORS_CSP,
} from '@/lib/notification-overlay-owner-phase12-smoke-env';

export type Phase12ParityCounters = {
  checks: number;
  mismatches: number;
  mirrorLagResolved: number;
  fallbackUsed: number;
};

export { isPhase12DiagEnabled, PHASE12_TELEGRAM_FRAME_ANCESTORS_CSP };

declare global {
  interface Window {
    __phase12ParityCounters?: Phase12ParityCounters;
  }
}

const EMPTY_PHASE12_PARITY_COUNTERS: Phase12ParityCounters = {
  checks: 0,
  mismatches: 0,
  mirrorLagResolved: 0,
  fallbackUsed: 0,
};

/** Eager counter object so smoke harness can read counters before first parity event. */
export function ensurePhase12ParityCountersInitialized(): void {
  if (typeof window === 'undefined') return;
  if (!isPhase12DiagEnabled()) return;
  if (window.__phase12ParityCounters) return;
  window.__phase12ParityCounters = { ...EMPTY_PHASE12_PARITY_COUNTERS };
}
