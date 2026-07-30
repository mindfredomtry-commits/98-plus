/**
 * Stage 6B Phase 5 — pending refresh generation ordering (pure helpers).
 *
 * Every async pending refresh stamps a monotonic generation at request start.
 * Only the latest eligible generation may apply its snapshot. Stale empty and
 * non-empty results are both rejected so older fetches cannot clear or
 * resurrect pending identities after newer authority has landed.
 */

export type PendingSnapshotApplyDecision =
  | {
      action: 'reject';
      reason:
        | 'stale-generation'
        | 'invalid-generation'
        | 'idempotent-duplicate';
      nextGeneration: number;
      itemIds: string[] | null;
      sourceVersion: string | null;
    }
  | {
      action: 'hold-local-empty';
      reason: 'empty-while-local-item-held';
      nextGeneration: number;
      itemIds: string[];
      sourceVersion: string | null;
    }
  | {
      action: 'apply';
      reason: 'eligible-generation' | 'unstamped-merge';
      nextGeneration: number;
      itemIds: string[];
      sourceVersion: string | null;
    };

function normalizeStampedGeneration(
  generation: number | null | undefined,
): { kind: 'none' } | { kind: 'invalid' } | { kind: 'ok'; value: number } {
  if (generation == null) return { kind: 'none' };
  if (typeof generation !== 'number' || !Number.isFinite(generation)) {
    return { kind: 'invalid' };
  }
  // Generations are allocated as positive monotonic integers.
  if (generation <= 0) return { kind: 'invalid' };
  return { kind: 'ok', value: Math.floor(generation) };
}

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Decide whether an incoming pending snapshot may replace runtime pending.
 * Does not mutate queue/display — pending authority only.
 */
export function decidePendingSnapshotApply(args: {
  currentGeneration: number;
  currentItemIds: readonly string[];
  currentSourceVersion: string | null;
  incomingIds: readonly string[];
  incomingSourceVersion: string | null;
  stamped: number | null | undefined;
  /** Runtime still holds a live queue head or active display. */
  holdsLocalItem: boolean;
}): PendingSnapshotApplyDecision {
  const stamped = normalizeStampedGeneration(args.stamped);
  if (stamped.kind === 'invalid') {
    return {
      action: 'reject',
      reason: 'invalid-generation',
      nextGeneration: args.currentGeneration,
      itemIds: null,
      sourceVersion: args.currentSourceVersion,
    };
  }

  if (stamped.kind === 'ok' && stamped.value < args.currentGeneration) {
    return {
      action: 'reject',
      reason: 'stale-generation',
      nextGeneration: args.currentGeneration,
      itemIds: null,
      sourceVersion: args.currentSourceVersion,
    };
  }

  const nextGeneration =
    stamped.kind === 'ok'
      ? Math.max(args.currentGeneration, stamped.value)
      : args.currentGeneration;

  const incoming = [...args.incomingIds];

  if (
    stamped.kind === 'ok' &&
    nextGeneration === args.currentGeneration &&
    sameIdList(args.currentItemIds, incoming) &&
    args.currentSourceVersion === args.incomingSourceVersion
  ) {
    return {
      action: 'reject',
      reason: 'idempotent-duplicate',
      nextGeneration: args.currentGeneration,
      itemIds: null,
      sourceVersion: args.currentSourceVersion,
    };
  }

  if (incoming.length === 0) {
    if (args.holdsLocalItem && args.currentItemIds.length > 0) {
      return {
        action: 'hold-local-empty',
        reason: 'empty-while-local-item-held',
        nextGeneration,
        itemIds: [...args.currentItemIds],
        sourceVersion: args.currentSourceVersion,
      };
    }
  }

  return {
    action: 'apply',
    reason: stamped.kind === 'ok' ? 'eligible-generation' : 'unstamped-merge',
    nextGeneration,
    itemIds: incoming,
    sourceVersion: args.incomingSourceVersion,
  };
}

/** True when stamped generation is strictly older than applied authority. */
export function isStalePendingRefreshGeneration(
  currentGeneration: number,
  stamped: number | null | undefined,
): boolean {
  const n = normalizeStampedGeneration(stamped);
  if (n.kind !== 'ok') return false;
  return n.value < currentGeneration;
}
