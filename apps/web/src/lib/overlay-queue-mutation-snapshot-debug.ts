'use client';

export type OverlayQueueMutationSnapshot = {
  source: string;
  reason: string;
  operation: string | null;
  prevLen: number | null;
  nextLen: number | null;
  prevHead: string | null;
  nextHead: string | null;
  at: number;
};

let lastOverlayQueueMutation: OverlayQueueMutationSnapshot | null = null;

export function recordOverlayQueueMutationSnapshot(input: {
  source: string;
  reason: string;
  operation?: string | null;
  prevLength?: number | null;
  nextLength?: number | null;
  prevHeadKind?: string | null;
  nextHeadKind?: string | null;
}): void {
  lastOverlayQueueMutation = {
    source: input.source,
    reason: input.reason,
    operation: input.operation ?? null,
    prevLen: input.prevLength ?? null,
    nextLen: input.nextLength ?? null,
    prevHead: input.prevHeadKind ?? null,
    nextHead: input.nextHeadKind ?? null,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
  };
}

export function getLastOverlayQueueMutationSnapshot(): OverlayQueueMutationSnapshot | null {
  return lastOverlayQueueMutation ? { ...lastOverlayQueueMutation } : null;
}
