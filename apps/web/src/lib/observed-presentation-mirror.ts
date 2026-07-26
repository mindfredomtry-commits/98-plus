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

export function getObservedPresentationState(): ObservedPresentationState | null {
  return current;
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
  for (const listener of listeners) {
    listener();
  }
}

/** Test / boot helper — clears the mirror without affecting production owners. */
export function resetObservedPresentationMirror(): void {
  current = null;
  for (const listener of listeners) {
    listener();
  }
}
