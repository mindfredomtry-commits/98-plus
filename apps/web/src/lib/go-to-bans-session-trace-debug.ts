'use client';

import { normalizeId } from '@/lib/normalize-json';

export type GoToBansSessionTrace = {
  banId: string;
  resultId: string;
  at: number;
};

export const GO_TO_BANS_SESSION_TRACE_WINDOW_MS = 120_000;

export const GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID = `gbt-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

declare global {
  interface Window {
    __goToBansSessionTraceModuleId?: string;
    __goToBansSessionTraceMirror?: GoToBansSessionTrace | null;
  }
}

let lastGoToBansSessionTrace: GoToBansSessionTrace | null = null;

type GoToBansSessionTraceAccessOp =
  | 'get'
  | 'set'
  | 'clear'
  | 'module-init'
  | 'mirror-read'
  | 'mirror-write';

function captureCaller(skipFrames = 2): string {
  try {
    const stack = new Error('[go-to-bans-session-trace]').stack ?? '';
    return stack.split('\n').slice(skipFrames, skipFrames + 12).join('\n');
  } catch {
    return '';
  }
}

function traceSnapshot(trace: GoToBansSessionTrace | null | undefined): {
  exists: boolean;
  banId: string | null;
  resultId: string | null;
} {
  return {
    exists: trace != null,
    banId: trace?.banId ?? null,
    resultId: trace?.resultId ?? null,
  };
}

function emitGoToBansSessionTraceAccess(input: {
  op: GoToBansSessionTraceAccessOp;
  caller: string;
  reason: string;
  before?: GoToBansSessionTrace | null;
  after?: GoToBansSessionTrace | null;
  returned?: GoToBansSessionTrace | null;
}): void {
  const before = traceSnapshot(input.before);
  const after = traceSnapshot(input.after);
  const returned =
    input.returned !== undefined ? traceSnapshot(input.returned) : null;
  const timestamp = performance.now();
  const payload = {
    timestamp,
    t: timestamp,
    op: input.op,
    caller: input.caller,
    reason: input.reason,
    moduleInstanceId: GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID,
    beforeExists: before.exists,
    afterExists: after.exists,
    beforeBanId: before.banId,
    afterBanId: after.banId,
    beforeResultId: before.resultId,
    afterResultId: after.resultId,
    returnedExists: returned?.exists ?? null,
    returnedBanId: returned?.banId ?? null,
    returnedResultId: returned?.resultId ?? null,
  };
  console.log('GO_TO_BANS_SESSION_TRACE_ACCESS', payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('GO_TO_BANS_SESSION_TRACE_ACCESS', payload);
  }
}

function emitGoToBansSessionTraceLifecycle(
  event: 'GO_TO_BANS_SESSION_TRACE_WRITE' | 'GO_TO_BANS_SESSION_TRACE_READ',
  data: Record<string, unknown>,
): void {
  const timestamp = performance.now();
  const payload = {
    timestamp,
    t: timestamp,
    moduleInstanceId: GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID,
    ...data,
  };
  console.log(event, payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, payload);
  }
}

function emitGoToBansSessionTraceClear(input: {
  reason: string;
  caller: string;
  banIdBefore: string | null;
  resultIdBefore: string | null;
}): void {
  const timestamp = performance.now();
  const payload = {
    timestamp,
    t: timestamp,
    moduleInstanceId: GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID,
    reason: input.reason,
    caller: input.caller,
    banIdBefore: input.banIdBefore,
    resultIdBefore: input.resultIdBefore,
  };
  console.log('GO_TO_BANS_SESSION_TRACE_CLEAR', payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('GO_TO_BANS_SESSION_TRACE_CLEAR', payload);
  }
}

function assignLastGoToBansSessionTrace(
  next: GoToBansSessionTrace | null,
  reason: string,
  caller: string,
): void {
  const prev = lastGoToBansSessionTrace;
  emitGoToBansSessionTraceAccess({
    op: 'get',
    caller,
    reason: `${reason}:assign-read-prev`,
    before: prev,
    after: prev,
    returned: prev,
  });
  emitGoToBansSessionTraceAccess({
    op: next === null ? 'clear' : 'set',
    caller,
    reason,
    before: prev,
    after: next,
  });
  emitGoToBansSessionTraceClear({
    reason,
    caller,
    banIdBefore: prev?.banId ?? null,
    resultIdBefore: prev?.resultId ?? null,
  });
  lastGoToBansSessionTrace = next;
  if (typeof window !== 'undefined') {
    const mirrorBefore = window.__goToBansSessionTraceMirror ?? null;
    emitGoToBansSessionTraceAccess({
      op: 'mirror-write',
      caller: 'assignLastGoToBansSessionTrace',
      reason,
      before: mirrorBefore,
      after: next,
    });
    window.__goToBansSessionTraceMirror = next;
  }
}

function logModuleInitAccess(): void {
  emitGoToBansSessionTraceAccess({
    op: 'module-init',
    caller: 'go-to-bans-session-trace-debug.ts:module-eval',
    reason: 'let-lastGoToBansSessionTrace-null',
    before: lastGoToBansSessionTrace,
    after: lastGoToBansSessionTrace,
    returned: lastGoToBansSessionTrace,
  });

  if (typeof window === 'undefined') return;

  const prevModuleId = window.__goToBansSessionTraceModuleId;
  const mirror = window.__goToBansSessionTraceMirror ?? null;
  emitGoToBansSessionTraceAccess({
    op: 'mirror-read',
    caller: 'logModuleInitAccess',
    reason: prevModuleId ? 'hmr-mirror-read' : 'first-load-mirror-read',
    before: mirror,
    after: mirror,
    returned: mirror,
  });

  const hmrReason = prevModuleId
    ? prevModuleId === GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID
      ? 'module-reinit-hmr-same-instance-id'
      : 'module-reinit-hmr-new-instance-id'
    : 'module-init';

  emitGoToBansSessionTraceAccess({
    op: 'module-init',
    caller: 'go-to-bans-session-trace-debug.ts:module-eval',
    reason: hmrReason,
    before: mirror,
    after: lastGoToBansSessionTrace,
  });

  emitGoToBansSessionTraceClear({
    reason: hmrReason,
    caller: 'go-to-bans-session-trace-debug.ts:module-eval',
    banIdBefore: mirror?.banId ?? null,
    resultIdBefore: mirror?.resultId ?? null,
  });

  window.__goToBansSessionTraceModuleId =
    GO_TO_BANS_SESSION_TRACE_MODULE_INSTANCE_ID;
}

logModuleInitAccess();

export function clearGoToBansSessionTrace(
  reason: string,
  caller = captureCaller(2),
): void {
  emitGoToBansSessionTraceAccess({
    op: 'clear',
    caller,
    reason: `${reason}:clear-entry`,
    before: lastGoToBansSessionTrace,
    after: null,
  });
  assignLastGoToBansSessionTrace(null, reason, caller);
}

export function recordGoToBansSessionTrace(
  banId: string,
  source = 'recordGoToBansSessionTrace',
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  const beforeSet = lastGoToBansSessionTrace;
  emitGoToBansSessionTraceAccess({
    op: 'get',
    caller: source,
    reason: 'record-before-set',
    before: beforeSet,
    after: beforeSet,
    returned: beforeSet,
  });
  const at = performance.now();
  const nextTrace: GoToBansSessionTrace = {
    banId: normalized,
    resultId: normalized,
    at,
  };
  assignLastGoToBansSessionTrace(
    nextTrace,
    beforeSet != null ? 'overwrite-new-object' : 'assign-new-object',
    source,
  );
  const afterSet = lastGoToBansSessionTrace;
  emitGoToBansSessionTraceAccess({
    op: 'get',
    caller: source,
    reason: 'record-after-set',
    before: beforeSet,
    after: afterSet,
    returned: afterSet,
  });
  emitGoToBansSessionTraceLifecycle('GO_TO_BANS_SESSION_TRACE_WRITE', {
    source,
    banId: normalized,
    resultId: normalized,
    traceExists: true,
    storedBanId: normalized,
    storedResultId: normalized,
    ageMs: 0,
  });
}

export function readGoToBansSessionTrace(): GoToBansSessionTrace | null {
  const trace = lastGoToBansSessionTrace;
  emitGoToBansSessionTraceAccess({
    op: 'get',
    caller: captureCaller(2),
    reason: 'readGoToBansSessionTrace',
    before: trace,
    after: trace,
    returned: trace,
  });
  return trace;
}

export function logGoToBansSessionTraceRead(input: {
  source: string;
  banId?: string | null;
  resultId?: string | null;
}): GoToBansSessionTrace | null {
  const trace = readGoToBansSessionTrace();
  const ageMs = trace != null ? performance.now() - trace.at : null;
  emitGoToBansSessionTraceLifecycle('GO_TO_BANS_SESSION_TRACE_READ', {
    source: input.source,
    banId: input.banId ?? null,
    resultId: input.resultId ?? null,
    traceExists: trace != null,
    storedBanId: trace?.banId ?? null,
    storedResultId: trace?.resultId ?? null,
    ageMs,
  });
  return trace;
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
  const trace = logGoToBansSessionTraceRead({
    source: `${input.source}:prefetch-guard`,
    banId: input.resultBanId,
    resultId: input.resultId,
  });
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
