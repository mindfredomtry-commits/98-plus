/**
 * Vertical V3 — runtime-owned completion edge for incoming_overboard.
 *
 * V2 made the runtime the sole authority for the overboard transition
 * (submit → consume head → next / idle). The host still owns obsolete
 * presentation state (lobby CTA session, stable incoming pin, visual dim
 * session) that used to be released by the retired host result path.
 *
 * This module publishes one edge — "the overboard chain ended with an empty
 * runtime" — so hosts can clear their own obsolete UI state. It never
 * dispatches, never consumes the queue and never selects a head.
 */
import { selectOverlayVisible } from './notification-runtime.selectors';
import type { NotificationRuntimeState } from './notification-runtime.types';

export type IncomingOverboardCompletion = {
  /** Monotonic edge counter; 0 = no completion yet. Hosts must dedupe on it. */
  seq: number;
  commandId: string | null;
  targetItemId: string | null;
  banId: string | null;
};

const NO_COMPLETION: IncomingOverboardCompletion = {
  seq: 0,
  commandId: null,
  targetItemId: null,
  banId: null,
};

let snapshot: IncomingOverboardCompletion = NO_COMPLETION;
const listeners = new Set<() => void>();

function banIdFromItemId(itemId: string): string {
  return itemId.startsWith('incoming:')
    ? itemId.slice('incoming:'.length)
    : itemId;
}

/** Runtime is fully settled with nothing left to paint. */
export function isRuntimeIdleEmptyAfterOverboard(
  state: NotificationRuntimeState,
): boolean {
  return (
    state.lifecycle.status === 'idle' &&
    state.display.kind == null &&
    state.display.payload == null &&
    state.items.queue.length === 0 &&
    state.action.status === 'idle' &&
    !selectOverlayVisible(state)
  );
}

/**
 * True only for the final overboard of a chain: an in-flight action on the
 * visible head became a settled empty runtime. Advancing to the next queued
 * card (still showing) and API failure both return false.
 */
export function isFinalIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  targetItemId: string,
): boolean {
  const wasInFlight =
    before.action.status === 'pending' &&
    before.action.targetItemId === targetItemId &&
    selectOverlayVisible(before);
  if (!wasInFlight) return false;
  return isRuntimeIdleEmptyAfterOverboard(after);
}

export function subscribeIncomingOverboardCompletion(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getIncomingOverboardCompletionSnapshot(): IncomingOverboardCompletion {
  return snapshot;
}

/** Publishes the edge when the transition qualifies. Returns true when emitted. */
export function noteIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
  args: { commandId: string; targetItemId: string },
): boolean {
  if (!isFinalIncomingOverboardCompletion(before, after, args.targetItemId)) {
    return false;
  }
  // One edge per command — a replayed execute cannot restart the CTA spring.
  if (snapshot.seq > 0 && snapshot.commandId === args.commandId) {
    return false;
  }
  snapshot = {
    seq: snapshot.seq + 1,
    commandId: args.commandId,
    targetItemId: args.targetItemId,
    banId: banIdFromItemId(args.targetItemId),
  };
  for (const listener of listeners) listener();
  return true;
}

export function resetIncomingOverboardCompletionForTest(): void {
  snapshot = NO_COMPLETION;
  listeners.clear();
}
