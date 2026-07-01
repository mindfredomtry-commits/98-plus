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

export type GoToBansPrefetchGuardMissTracePayload = {
  source: string;
  resultBanId: string;
  resultId: string;
  traceExists: boolean;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  ageMs: number | null;
  isRecent: boolean;
  banIdMatches: boolean;
  resultIdMatches: boolean;
  ownerShownOverlayHasResult: boolean;
  resultCtaConsumedHasBanId: boolean;
  shownOverlayKeysHasResult: boolean;
  shouldBlock: boolean;
  skipReason: string | null;
  timestamp?: number;
};

export function buildGoToBansPrefetchGuardMissTrace(input: {
  source: string;
  resultBanId: string;
  resultId: string;
  ownerShownOverlayHasResult: boolean;
  resultCtaConsumedHasBanId: boolean;
  shownOverlayKeysHasResult: boolean;
}): GoToBansPrefetchGuardMissTracePayload {
  const trace = readGoToBansSessionTrace();
  const resultBanNorm = normalizeId(input.resultBanId);
  const resultIdNorm = normalizeId(input.resultId);
  const traceExists = trace != null;
  const lastGoToBansBanId = trace?.banId ?? null;
  const lastGoToBansResultId = trace?.resultId ?? null;
  const ageMs = trace != null ? performance.now() - trace.at : null;
  const isRecent =
    ageMs != null && ageMs <= GO_TO_BANS_SESSION_TRACE_WINDOW_MS;
  const lastBanNorm = normalizeId(lastGoToBansBanId ?? '');
  const lastResultNorm = normalizeId(lastGoToBansResultId ?? '');
  const banIdMatches =
    resultBanNorm.length > 0 &&
    lastBanNorm.length > 0 &&
    resultBanNorm === lastBanNorm;
  const resultIdMatches =
    resultIdNorm.length > 0 &&
    lastResultNorm.length > 0 &&
    resultIdNorm === lastResultNorm;
  const shouldBlock = traceExists && isRecent && banIdMatches;

  let skipReason: string | null = null;
  if (!traceExists) {
    skipReason = 'no-go-to-bans-session-trace';
  } else if (!isRecent) {
    skipReason = 'go-to-bans-session-trace-expired';
  } else if (!banIdMatches) {
    skipReason = 'go-to-bans-ban-id-mismatch';
  } else if (!resultIdMatches) {
    skipReason = 'go-to-bans-result-id-mismatch';
  } else if (shouldBlock) {
    skipReason = 'go-to-bans-consumed-prefetch-block';
  } else {
    skipReason = 'guard-not-applied-unknown';
  }

  return {
    source: input.source,
    resultBanId: input.resultBanId,
    resultId: input.resultId,
    traceExists,
    lastGoToBansBanId,
    lastGoToBansResultId,
    ageMs,
    isRecent,
    banIdMatches,
    resultIdMatches,
    ownerShownOverlayHasResult: input.ownerShownOverlayHasResult,
    resultCtaConsumedHasBanId: input.resultCtaConsumedHasBanId,
    shownOverlayKeysHasResult: input.shownOverlayKeysHasResult,
    shouldBlock,
    skipReason,
  };
}

export function logGoToBansPrefetchGuardMissTrace(
  data: GoToBansPrefetchGuardMissTracePayload,
): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('GO_TO_BANS_PREFETCH_GUARD_MISS_TRACE', payload);
  window.__debug98log?.('GO_TO_BANS_PREFETCH_GUARD_MISS_TRACE', payload);
}
