/**
 * Atomic SUCCESS → incoming materialization acknowledgement.
 *
 * Presentation-only: does not own queue/display/lifecycle. InstantBanFlow
 * retains SUCCESS until `nextDisplayDomMounted(expectedId)` matches.
 * IncomingBanOverlay acknowledges only after the card DOM is laid out.
 */

export type IncomingDomMountAckSnapshot = {
  expectedDisplayId: string | null;
  mountedDisplayId: string | null;
  /** True only when mountedDisplayId matches expectedDisplayId. */
  matchingDomMounted: boolean;
  /**
   * Visibility lifetime may begin only after matching DOM mount.
   * No product timer is started here — this is the start gate only.
   */
  visibilityLifetimeStartedForId: string | null;
};

type Listener = () => void;

let expectedDisplayId: string | null = null;
let mountedDisplayId: string | null = null;
let visibilityLifetimeStartedForId: string | null = null;
const listeners = new Set<Listener>();

function normalizeDisplayId(id: string | null | undefined): string | null {
  const trimmed = id?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function snapshot(): IncomingDomMountAckSnapshot {
  const expected = expectedDisplayId;
  const mounted = mountedDisplayId;
  return {
    expectedDisplayId: expected,
    mountedDisplayId: mounted,
    matchingDomMounted:
      expected != null && mounted != null && expected === mounted,
    visibilityLifetimeStartedForId,
  };
}

/** Arm the expected next display id (SUCCESS exit / handoff wait). */
export function expectNextDisplayDomMount(displayId: string | null): void {
  const next = normalizeDisplayId(displayId);
  if (expectedDisplayId === next) return;
  expectedDisplayId = next;
  // Stale mount must not release SUCCESS for a new expected id.
  if (mountedDisplayId != null && mountedDisplayId !== next) {
    mountedDisplayId = null;
    visibilityLifetimeStartedForId = null;
  }
  notify();
}

/**
 * Incoming card DOM laid out for this display id.
 * Starts visibility lifetime for this id (gate only — no auto-dismiss clock).
 */
export function acknowledgeIncomingDomMounted(displayId: string): void {
  const id = normalizeDisplayId(displayId);
  if (!id) return;
  const changed =
    mountedDisplayId !== id || visibilityLifetimeStartedForId !== id;
  mountedDisplayId = id;
  // Lifetime starts only on DOM mount — never on runtime materialize / shell mount.
  visibilityLifetimeStartedForId = id;
  if (changed) notify();
}

/** Clear mount ack when the card unmounts (id must match to avoid races). */
export function clearIncomingDomMountAck(displayId?: string | null): void {
  const id = normalizeDisplayId(displayId);
  if (id != null && mountedDisplayId != null && mountedDisplayId !== id) {
    return;
  }
  if (mountedDisplayId == null && visibilityLifetimeStartedForId == null) {
    return;
  }
  mountedDisplayId = null;
  visibilityLifetimeStartedForId = null;
  notify();
}

/** Clear expected + mount (handoff complete or abandoned). */
export function resetIncomingDomMountAck(): void {
  if (
    expectedDisplayId == null &&
    mountedDisplayId == null &&
    visibilityLifetimeStartedForId == null
  ) {
    return;
  }
  expectedDisplayId = null;
  mountedDisplayId = null;
  visibilityLifetimeStartedForId = null;
  notify();
}

/** Predicate: matching incoming DOM is mounted for the expected display id. */
export function nextDisplayDomMounted(displayId: string | null): boolean {
  const expected = normalizeDisplayId(displayId) ?? expectedDisplayId;
  if (expected == null || mountedDisplayId == null) return false;
  return mountedDisplayId === expected;
}

export function getIncomingDomMountAckSnapshot(): IncomingDomMountAckSnapshot {
  return snapshot();
}

export function subscribeIncomingDomMountAck(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — reset module state between specs. */
export function resetIncomingDomMountAckForTest(): void {
  expectedDisplayId = null;
  mountedDisplayId = null;
  visibilityLifetimeStartedForId = null;
  listeners.clear();
}
