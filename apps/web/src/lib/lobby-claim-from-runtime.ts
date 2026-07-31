/**
 * Stage 7 Phase 1 — Lobby claim helpers removed from Runtime.
 * Accidental callers fail loudly.
 */
export function claimLobbyFromRuntime(): never {
  throw new Error(
    'lobby-claim-from-runtime removed in Stage 7 Phase 1 — Runtime has no Lobby policy',
  );
}
