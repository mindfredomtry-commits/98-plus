export type OverboardFlowTraceEvent = {
  ts: number;
  stage: string;
  detail: string;
};

export type OverboardFlowTraceSnapshot = {
  banId: string | null;
  events: OverboardFlowTraceEvent[];
  emergencyHint: string | null;
};

const MAX_EVENTS = 48;

let snapshot: OverboardFlowTraceSnapshot = {
  banId: null,
  events: [],
  emergencyHint: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function formatDetail(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/** Loud marker for on-device deploy verification — console.error + on-screen trace. */
export function markVisibleOverboardTrace(
  marker: string,
  data?: Record<string, unknown>,
): void {
  console.error(marker);
  traceOverboardFlow(marker, data);
}

/** Always logs to console + appends to dev trace overlay. */
export function traceOverboardFlow(
  stage: string,
  data?: Record<string, unknown>,
): void {
  const detail = formatDetail(data);
  console.log(`[OVERBOARD FLOW] ${stage}`, detail || '');
  snapshot = {
    ...snapshot,
    events: [
      ...snapshot.events,
      { ts: Date.now(), stage, detail },
    ].slice(-MAX_EVENTS),
  };
  emit();
}

export function resetOverboardFlowTrace(banId: string): void {
  snapshot = { banId, events: [], emergencyHint: null };
  emit();
}

export function setOverboardEmergencyHint(message: string | null): void {
  snapshot = { ...snapshot, emergencyHint: message };
  emit();
}

export function getOverboardFlowTrace(): OverboardFlowTraceSnapshot {
  return snapshot;
}

export function subscribeOverboardFlowTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatOverboardFlowTraceLines(
  trace: OverboardFlowTraceSnapshot,
): string {
  const lines = ['[OVERBOARD FLOW TRACE]'];
  if (trace.banId) lines.push(`banId: ${trace.banId}`);
  if (trace.emergencyHint) lines.push(`hint: ${trace.emergencyHint}`);
  for (const e of trace.events) {
    const t = new Date(e.ts).toISOString().slice(11, 23);
    lines.push(
      e.detail
        ? `${t} ${e.stage} ${e.detail}`
        : `${t} ${e.stage}`,
    );
  }
  return lines.join('\n');
}

export function logOverboardButtonClick(
  banId: string,
  handler: string,
): void {
  resetOverboardFlowTrace(banId);
  console.log('[OVERBOARD FLOW] REAL BUTTON CLICK');
  console.log('[OVERBOARD FLOW] banId', banId);
  traceOverboardFlow('REAL BUTTON CLICK', { banId, handler });
  traceOverboardFlow('banId', { banId });
}

export function logOverboardResultForce(
  stage:
    | 'start'
    | 'normalized result'
    | 'set activeOverlayKind=result'
    | 'result set true'
    | 'delivered marked after open'
    | 'final state',
  data?: Record<string, unknown>,
): void {
  console.log(`[OVERBOARD RESULT FORCE] ${stage}`, data ?? '');
}

/** @deprecated use traceOverboardFlow */
export function logOverboardFlow(
  stage: string,
  data?: Record<string, unknown>,
): void {
  traceOverboardFlow(stage, data);
}
