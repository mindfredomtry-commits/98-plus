'use client';

import { normalizeId } from '@/lib/normalize-json';

export type GoToBansSessionTrace = {
  banId: string;
  resultId: string;
  at: number;
};

export const GO_TO_BANS_SESSION_TRACE_WINDOW_MS = 120_000;

let lastGoToBansSessionTrace: GoToBansSessionTrace | null = null;

export function recordGoToBansSessionTrace(banId: string): void {
  const normalized = banId.trim();
  if (!normalized) return;
  lastGoToBansSessionTrace = {
    banId: normalized,
    resultId: normalized,
    at: performance.now(),
  };
}

export function readGoToBansSessionTrace(): GoToBansSessionTrace | null {
  return lastGoToBansSessionTrace;
}

export function getGoToBansPrefetchResultBlockDecision(banId: string): {
  blocked: boolean;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  ageMs: number | null;
} {
  const trace = readGoToBansSessionTrace();
  if (!trace) {
    return {
      blocked: false,
      lastGoToBansBanId: null,
      lastGoToBansResultId: null,
      ageMs: null,
    };
  }
  const ageMs = performance.now() - trace.at;
  if (ageMs > GO_TO_BANS_SESSION_TRACE_WINDOW_MS) {
    return {
      blocked: false,
      lastGoToBansBanId: trace.banId,
      lastGoToBansResultId: trace.resultId,
      ageMs,
    };
  }
  const resultNorm = normalizeId(banId);
  const lastNorm = normalizeId(trace.banId);
  const blocked =
    resultNorm.length > 0 && lastNorm.length > 0 && resultNorm === lastNorm;
  return {
    blocked,
    lastGoToBansBanId: trace.banId,
    lastGoToBansResultId: trace.resultId,
    ageMs,
  };
}

export function logGoToBansPrefetchResultBlock(input: {
  source: string;
  banId: string;
  resultId: string;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  ageMs: number | null;
}): void {
  const timestamp = performance.now();
  const payload = {
    timestamp,
    t: timestamp,
    source: input.source,
    banId: input.banId,
    resultId: input.resultId,
    lastGoToBansBanId: input.lastGoToBansBanId,
    lastGoToBansResultId: input.lastGoToBansResultId,
    ageMs: input.ageMs,
    blocked: true,
    reason: 'go-to-bans-consumed-prefetch-block',
  };
  console.log('GO_TO_BANS_PREFETCH_RESULT_BLOCK', payload);
  window.__debug98log?.('GO_TO_BANS_PREFETCH_RESULT_BLOCK', payload);
}
