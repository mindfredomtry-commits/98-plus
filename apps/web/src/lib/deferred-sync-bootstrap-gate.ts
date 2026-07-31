/**
 * Stage 7 Phase 1 — deferred sync bootstrap gate removed (was Lobby policy).
 */
export function mayRunDeferredSyncBootstrap(): never {
  throw new Error(
    'deferred-sync-bootstrap-gate removed in Stage 7 Phase 1 — Runtime has no Lobby policy',
  );
}
