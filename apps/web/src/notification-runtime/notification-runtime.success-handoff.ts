/**
 * Stage 7 Phase 1 — SUCCESS handoff module disconnected from production.
 * File retained temporarily; all entry points throw if called.
 */
export function requestSuccessHandoff(): never {
  throw new Error(
    'SUCCESS_HANDOFF removed in Stage 7 Phase 1 — Runtime is a passive queue',
  );
}
