/**
 * Stage 8 Phase 9E — single-flight Notifications Sync controller.
 *
 * Pure concurrency policy for HTTP Sync requests.
 * One in-flight sync at a time. REQUEST_FULL_SYNC latches; never dropped.
 * Stale generations never clear a newer in-flight owner.
 *
 * No React. No Runtime reconcile. No Journal.
 */

export type SyncFlightReason = 'bootstrap' | 'reconnect' | 'user';

export type SyncFlightState = {
  /** True while a sync owns the flight lock. */
  inFlight: boolean;
  /** Monotonic generation counter. */
  generation: number;
  /** Generation that currently owns inFlight (null when idle). */
  ownerGeneration: number | null;
  /** Latched REQUEST_FULL_SYNC while any sync is running. */
  pendingFullSync: boolean;
};

export type BeginSyncFlightResult =
  | {
      accepted: true;
      generation: number;
      state: SyncFlightState;
      /** Full Snapshot (afterRevision=null). */
      forceFullSnapshot: boolean;
    }
  | {
      accepted: false;
      state: SyncFlightState;
      reason: 'in-flight-coalesced' | 'pending-latched';
    };

export type CompleteSyncFlightResult = {
  state: SyncFlightState;
  /** This generation still owns the lock (not stale). */
  isOwner: boolean;
  /** Clear in-flight and run lifecycle side effects only when isOwner. */
  shouldClearInFlight: boolean;
  shouldNotifyBootCompleted: boolean;
  shouldNotifyReconnectCompleted: boolean;
  /** Start exactly one follow-up full Snapshot (afterRevision=null). */
  shouldRunPendingFullSync: boolean;
};

export function createInitialSyncFlightState(): SyncFlightState {
  return {
    inFlight: false,
    generation: 0,
    ownerGeneration: null,
    pendingFullSync: false,
  };
}

/**
 * Latch a REQUEST_FULL_SYNC. If idle, caller should begin a 'user' full sync.
 * If in flight, pending is set and no parallel sync starts.
 */
export function latchPendingFullSync(state: SyncFlightState): {
  state: SyncFlightState;
  shouldStartNow: boolean;
} {
  if (state.inFlight) {
    return {
      state: { ...state, pendingFullSync: true },
      shouldStartNow: false,
    };
  }
  return {
    state: { ...state, pendingFullSync: false },
    shouldStartNow: true,
  };
}

/**
 * Attempt to begin a sync. Never bypasses the in-flight lock — including reconnect.
 */
export function beginSyncFlight(
  state: SyncFlightState,
  reason: SyncFlightReason,
): BeginSyncFlightResult {
  if (state.inFlight) {
    if (reason === 'user') {
      // Full-sync request while busy → latch; run after current settles.
      return {
        accepted: false,
        state: { ...state, pendingFullSync: true },
        reason: 'pending-latched',
      };
    }
    // bootstrap / reconnect while busy → coalesce (do not start parallel).
    return {
      accepted: false,
      state,
      reason: 'in-flight-coalesced',
    };
  }

  const generation = state.generation + 1;
  const forceFullSnapshot = reason === 'user';
  return {
    accepted: true,
    generation,
    forceFullSnapshot,
    state: {
      ...state,
      inFlight: true,
      generation,
      ownerGeneration: generation,
      // Starting a full snapshot consumes the latch intent.
      pendingFullSync: forceFullSnapshot ? false : state.pendingFullSync,
    },
  };
}

/**
 * Finalize a sync generation. Stale generations must not clear a newer owner.
 *
 * Pending full-sync policy:
 * - If this generation is owner and pending is set:
 *   - If this sync was already a successful full Snapshot → coalesce (clear pending, no re-run).
 *   - Otherwise → clear pending and signal exactly one follow-up full Snapshot.
 */
export function completeSyncFlight(
  state: SyncFlightState,
  input: {
    generation: number;
    reason: SyncFlightReason;
    ok: boolean;
    /** First cold-boot settle still needed. */
    coldBootSettled: boolean;
    /** Token/user for this request still match current session. */
    sessionMatches: boolean;
  },
): CompleteSyncFlightResult {
  const isOwner = state.ownerGeneration === input.generation;
  if (!isOwner) {
    return {
      state,
      isOwner: false,
      shouldClearInFlight: false,
      shouldNotifyBootCompleted: false,
      shouldNotifyReconnectCompleted: false,
      shouldRunPendingFullSync: false,
    };
  }

  const pending = state.pendingFullSync;
  // Successful full Snapshot already satisfies pending REQUEST_FULL_SYNC.
  const coalescePending =
    pending && input.reason === 'user' && input.ok === true;

  const shouldRunPendingFullSync =
    pending && !coalescePending && input.sessionMatches;

  const next: SyncFlightState = {
    ...state,
    inFlight: false,
    ownerGeneration: null,
    pendingFullSync: false,
  };

  return {
    state: next,
    isOwner: true,
    shouldClearInFlight: true,
    shouldNotifyBootCompleted: !input.coldBootSettled && input.sessionMatches,
    shouldNotifyReconnectCompleted:
      input.reason === 'reconnect' && input.sessionMatches,
    shouldRunPendingFullSync,
  };
}
