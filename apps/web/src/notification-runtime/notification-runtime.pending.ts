/**
 * Stage 8 Phase 8 — pending helpers retired as Runtime authority.
 * Kept as thin id helpers for transport prefetch mapping only.
 */
export function pendingItemIdFromParts(
  kind: 'incoming' | 'check' | 'result',
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return `${kind}:${id}`;
}

export function pendingIdsFromPrefetchParts(input: {
  incomingIds: string[];
  checkId: string | null;
  resultId: string | null;
}): string[] {
  const out: string[] = [];
  for (const id of input.incomingIds) {
    const p = pendingItemIdFromParts('incoming', id);
    if (p) out.push(p);
  }
  const c = pendingItemIdFromParts('check', input.checkId);
  if (c) out.push(c);
  const r = pendingItemIdFromParts('result', input.resultId);
  if (r) out.push(r);
  return out;
}

/** @deprecated No longer Runtime authority — returns 0. */
export function nextPendingAuthorityGeneration(): number {
  return 0;
}

/** @deprecated No-op — pending is not Runtime authority after Phase 8. */
export function ingestPendingSnapshot(
  _store: unknown,
  _itemIds: string[],
  _source: unknown,
  _sourceVersion?: string | null,
  _generation?: number | null,
): void {
  // intentionally empty
}
