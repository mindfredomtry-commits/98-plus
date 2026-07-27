/**
 * Stage 1 — observed presentation mirror store.
 *
 * Read-only telemetry sink. Publishers may only call publishObservedPresentation
 * with values derived from observePresentationState. This module never writes
 * notification runtime, never clears displays, never dispatches lifecycle.
 */

import type { ObservedPresentationState } from './observed-presentation-state';

type Listener = () => void;

let current: ObservedPresentationState | null = null;
const listeners = new Set<Listener>();
let publishCount = 0;

export function getObservedPresentationState(): ObservedPresentationState | null {
  return current;
}

/** Monotonic publish counter — remount detection / sequence traces only. */
export function getObservedPresentationPublishCount(): number {
  return publishCount;
}

export function subscribeObservedPresentation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mirror write only — replaces the observed snapshot for subscribers/tests.
 * Does not touch React trees, runtime, or portals.
 */
export function publishObservedPresentation(
  next: ObservedPresentationState,
): void {
  current = next;
  publishCount += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** Test / boot helper — clears the mirror without affecting production owners. */
export function resetObservedPresentationMirror(): void {
  current = null;
  publishCount = 0;
  for (const listener of listeners) {
    listener();
  }
}
