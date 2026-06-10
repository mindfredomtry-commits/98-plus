
export type ResultOpenTraceEntry = {
  ts: number;
  source: string;
  phase: string;
  banId: string | null;
  resultId: string | null;
  lockReason: string | null;
  bypassPriorityLock: boolean;
  allowed: boolean;
  activeOverlayKind: string | null;
  activeBanDeepLinkId: string | null;
  blockReason: string | null;
  isLocked: boolean;
  isLocalUserAction: boolean;
  mode: string | null;
  reason: string | null;
  extra?: Record<string, unknown>;
};

export type ResultPathPhase =
  | 'click'
  | 'path-skip'
  | 'attempt'
  | 'state-written'
  | 'state-cleared'
  | 'poll-gate'
  | 'poll-hit'
  | 'poll-miss'
  | 'poll-skip-delivered'
  | 'receive';

const MAX_ENTRIES = 120;
const entries: ResultOpenTraceEntry[] = [];
const listeners = new Set<() => void>();

export function pushResultOpenTrace(entry: ResultOpenTraceEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    (
      window as Window & { __98_RESULT_OPEN_TRACE__?: ResultOpenTraceEntry[] }
    ).__98_RESULT_OPEN_TRACE__ = [...entries];
  }
}

/** Unified timeline row — also mirrors to [RESULT OPEN ATTEMPT] for console filter. */
export function logResultPath(
  source: string,
  phase: ResultPathPhase,
  data: {
    banId?: string | null;
    resultId?: string | null;
    allowed?: boolean;
    bypassPriorityLock?: boolean;
    reason?: string | null;
    blockReason?: string | null;
    mode?: string | null;
    extra?: Record<string, unknown>;
  } = {},
): void {
  const banId = data.banId ?? data.resultId ?? null;
  const allowed = data.allowed ?? phase !== 'path-skip';
  const row = {
    phase,
    reason: data.reason ?? data.blockReason ?? null,
    ...data.extra,
  };
  console.log('[RESULT PATH]', {
    source,
    phase,
    banId,
    resultId: data.resultId ?? banId,
    allowed,
    ...row,
  });
  pushResultOpenTrace({
    ts: Date.now(),
    source: String(source),
    phase,
    banId,
    resultId: data.resultId ?? banId,
    lockReason: null,
    bypassPriorityLock: data.bypassPriorityLock === true,
    allowed,
    activeOverlayKind: null,
    activeBanDeepLinkId: null,
    blockReason: data.blockReason ?? data.reason ?? null,
    isLocked: false,
    isLocalUserAction: false,
    mode: data.mode ?? null,
    reason: data.reason ?? data.blockReason ?? null,
    extra: row,
  });
}

export function getResultOpenTrace(): readonly ResultOpenTraceEntry[] {
  return entries;
}

export function subscribeResultOpenTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatResultOpenTraceLines(
  list: readonly ResultOpenTraceEntry[] = entries,
): string {
  if (list.length === 0) return '[RESULT TRACE] (empty)';
  return list
    .map((e) => {
      const phase = e.phase ?? e.extra?.phase ?? '—';
      const deny = e.allowed ? '' : ` deny=${e.blockReason ?? e.reason ?? '—'}`;
      const rid = e.resultId && e.resultId !== e.banId ? ` rid=${e.resultId}` : '';
      return `[${new Date(e.ts).toISOString().slice(11, 23)}] phase=${phase} source=${e.source} ban=${e.banId ?? '—'}${rid} allowed=${e.allowed} bypass=${e.bypassPriorityLock}${deny}`;
    })
    .join('\n');
}

export function findLastAllowedResultOpen(
  list: readonly ResultOpenTraceEntry[] = entries,
): ResultOpenTraceEntry | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (
      e?.allowed &&
      (e.phase === 'state-written' ||
        e.extra?.phase === 'state-written' ||
        (e.source === 'receiveResult' && e.allowed))
    ) {
      return e;
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.allowed) return list[i]!;
  }
  return null;
}
