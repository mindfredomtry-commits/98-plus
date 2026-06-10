export type ResultOpenTraceEntry = {
  ts: number;
  source: string;
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
  extra?: Record<string, unknown>;
};

const MAX_ENTRIES = 80;
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
      const deny = e.allowed ? '' : ` deny=${e.blockReason ?? '—'}`;
      return `[${new Date(e.ts).toISOString().slice(11, 23)}] ${e.source} ban=${e.banId ?? '—'} allowed=${e.allowed} lock=${e.lockReason ?? '—'} bypass=${e.bypassPriorityLock}${deny} overlay=${e.activeOverlayKind ?? '—'} deep=${e.activeBanDeepLinkId ?? '—'}`;
    })
    .join('\n');
}

/** Last entry where result was allowed to show (allowed=true). */
export function findLastAllowedResultOpen(
  list: readonly ResultOpenTraceEntry[] = entries,
): ResultOpenTraceEntry | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.allowed) return list[i]!;
  }
  return null;
}
