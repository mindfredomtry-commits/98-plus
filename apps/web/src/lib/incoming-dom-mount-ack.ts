/**
 * Atomic SUCCESS → incoming materialization acknowledgement.
 *
 * Presentation-only: does not own queue/display/lifecycle. InstantBanFlow
 * retains SUCCESS until `nextDisplayDomMounted(expectedId)` matches.
 * IncomingBanOverlay acknowledges only after the card DOM is laid out.
 *
 * CRITICAL: getIncomingDomMountAckSnapshot must return a referentially stable
 * object when values are unchanged — useSyncExternalStore compares with
 * Object.is and a fresh object each call causes React error #185 (max update depth).
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
/** Referentially stable while values are unchanged (useSyncExternalStore). */
let cachedSnapshot: IncomingDomMountAckSnapshot = {
  expectedDisplayId: null,
  mountedDisplayId: null,
  matchingDomMounted: false,
  visibilityLifetimeStartedForId: null,
};
const listeners = new Set<Listener>();

/** Test / diagnostics — counts mutating writes only (idempotent no-ops excluded). */
let acknowledgeWriteCount = 0;
let expectWriteCount = 0;
let clearWriteCount = 0;
let resetWriteCount = 0;
let snapshotCallCount = 0;

function normalizeDisplayId(id: string | null | undefined): string | null {
  const trimmed = id?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function rebuildSnapshotIfNeeded(): IncomingDomMountAckSnapshot {
  const matchingDomMounted =
    expectedDisplayId != null &&
    mountedDisplayId != null &&
    expectedDisplayId === mountedDisplayId;
  if (
    cachedSnapshot.expectedDisplayId === expectedDisplayId &&
    cachedSnapshot.mountedDisplayId === mountedDisplayId &&
    cachedSnapshot.matchingDomMounted === matchingDomMounted &&
    cachedSnapshot.visibilityLifetimeStartedForId ===
      visibilityLifetimeStartedForId
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = {
    expectedDisplayId,
    mountedDisplayId,
    matchingDomMounted,
    visibilityLifetimeStartedForId,
  };
  return cachedSnapshot;
}

/** Arm the expected next display id (SUCCESS exit / handoff wait). */
export function expectNextDisplayDomMount(displayId: string | null): void {
  const next = normalizeDisplayId(displayId);
  if (expectedDisplayId === next) return;
  expectedDisplayId = next;
  expectWriteCount += 1;
  // Stale mount must not release SUCCESS for a new expected id.
  if (mountedDisplayId != null && mountedDisplayId !== next) {
    mountedDisplayId = null;
    visibilityLifetimeStartedForId = null;
  }
  rebuildSnapshotIfNeeded();
  notify();
}

/**
 * Incoming card DOM laid out for this display id.
 * Writes at most once per matching displayId — repeated ack is a no-op.
 */
export function acknowledgeIncomingDomMounted(displayId: string): void {
  const id = normalizeDisplayId(displayId);
  if (!id) return;
  // Idempotent: same mounted id must not mutate or notify.
  if (
    mountedDisplayId === id &&
    visibilityLifetimeStartedForId === id
  ) {
    return;
  }
  mountedDisplayId = id;
  visibilityLifetimeStartedForId = id;
  acknowledgeWriteCount += 1;
  rebuildSnapshotIfNeeded();
  notify();
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
  clearWriteCount += 1;
  rebuildSnapshotIfNeeded();
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
  resetWriteCount += 1;
  rebuildSnapshotIfNeeded();
  notify();
}

/** Predicate: matching incoming DOM is mounted for the expected display id. */
export function nextDisplayDomMounted(displayId: string | null): boolean {
  const expected = normalizeDisplayId(displayId) ?? expectedDisplayId;
  if (expected == null || mountedDisplayId == null) return false;
  return mountedDisplayId === expected;
}

/**
 * Referentially stable while values are unchanged.
 * Required by useSyncExternalStore (Object.is comparison).
 */
export function getIncomingDomMountAckSnapshot(): IncomingDomMountAckSnapshot {
  snapshotCallCount += 1;
  return rebuildSnapshotIfNeeded();
}

export function subscribeIncomingDomMountAck(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type IncomingDomMountAckWriteCounts = {
  acknowledge: number;
  expect: number;
  clear: number;
  reset: number;
  snapshotCalls: number;
};

export function getIncomingDomMountAckWriteCounts(): IncomingDomMountAckWriteCounts {
  return {
    acknowledge: acknowledgeWriteCount,
    expect: expectWriteCount,
    clear: clearWriteCount,
    reset: resetWriteCount,
    snapshotCalls: snapshotCallCount,
  };
}

/** Test helper — reset module state between specs. */
export function resetIncomingDomMountAckForTest(): void {
  expectedDisplayId = null;
  mountedDisplayId = null;
  visibilityLifetimeStartedForId = null;
  cachedSnapshot = {
    expectedDisplayId: null,
    mountedDisplayId: null,
    matchingDomMounted: false,
    visibilityLifetimeStartedForId: null,
  };
  acknowledgeWriteCount = 0;
  expectWriteCount = 0;
  clearWriteCount = 0;
  resetWriteCount = 0;
  snapshotCallCount = 0;
  listeners.clear();
}
