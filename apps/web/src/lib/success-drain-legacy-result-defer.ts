/**
 * SUCCESS-drain single-owner paint gate.
 *
 * Proven production failure:
 *   successExitDraining + runtime.lifecycle=draining + runtime.display=null
 *   + legacy owner activeKind=result + queueResultOverlayClaimed
 *   → NotificationQueueShell ResultOverlay flashes overboard.
 *
 * Invariant: during SUCCESS handoff draining, a legacy/owner result must not
 * become renderable unless the runtime itself currently owns a result display
 * for that same id. Deferred owner results are not consumed, deleted, or marked
 * shown.
 *
 * Follow-on: once runtime materializes a non-result head (incoming/check),
 * legacy owner result must not keep ResultOverlay claimed / shell stuck on
 * result (blank dim / children-null).
 */

export type SuccessDrainRuntimeDisplayKind =
  | 'result'
  | 'incoming'
  | 'check'
  | null;

export type SuccessDrainLegacyResultDeferInput = {
  successExitDraining: boolean;
  runtimeLifecycle: string | null | undefined;
  runtimeDisplayKind: SuccessDrainRuntimeDisplayKind;
  runtimeDisplayResultId: string | null;
  /** Owner/legacy would otherwise drive result paint (active/held/queue/payload). */
  legacyResultPaintCandidate: boolean;
  legacyResultId: string | null;
};

export function runtimeOwnsMatchingResultDisplay(
  input: Pick<
    SuccessDrainLegacyResultDeferInput,
    'runtimeDisplayKind' | 'runtimeDisplayResultId' | 'legacyResultId'
  >,
): boolean {
  if (input.runtimeDisplayKind !== 'result') return false;
  const runtimeId = (input.runtimeDisplayResultId ?? '').trim();
  if (!runtimeId) return false;
  const legacyId = (input.legacyResultId ?? '').trim();
  if (!legacyId) return true;
  return runtimeId === legacyId;
}

/**
 * True → do not activate queueResultOverlayClaimed / ResultOverlay from legacy
 * owner result; prefer runtime display shell when present.
 */
export function shouldDeferLegacyResultOverlayPaint(
  input: SuccessDrainLegacyResultDeferInput,
): boolean {
  if (!input.legacyResultPaintCandidate) return false;
  if (runtimeOwnsMatchingResultDisplay(input)) return false;

  // Primary: SUCCESS draining with no runtime-owned result display.
  if (
    input.successExitDraining &&
    input.runtimeLifecycle === 'draining' &&
    input.runtimeDisplayKind !== 'result'
  ) {
    return true;
  }

  // Follow-on: runtime already owns an actionable non-result head.
  if (
    (input.runtimeLifecycle === 'draining' ||
      input.runtimeLifecycle === 'showing') &&
    (input.runtimeDisplayKind === 'incoming' ||
      input.runtimeDisplayKind === 'check')
  ) {
    return true;
  }

  return false;
}

/**
 * Exact release condition — a deferred legacy result MUST NOT starve.
 *
 * `deferLegacyResultOverlayPaint` is true only while runtime is actively:
 *   - SUCCESS-draining with no runtime result display, or
 *   - draining/showing a competing incoming/check head.
 *
 * Both states are transient and runtime-owned. As soon as SUCCESS drain
 * finishes, exactly one release fires:
 *
 *   R1 (runtime materializes matching result):
 *       runtimeDisplayKind === 'result' owning the same id
 *       → runtime paints it; legacy defers to runtime (single owner).
 *
 *   R2 (runtime releases ownership):
 *       runtime lifecycle leaves 'draining'/'showing' (e.g. 'idle') and no
 *       incoming/check head is owned → legacy ResultOverlay eligible again.
 *
 * There is no input with a legacy candidate where runtime is idle/released and
 * defer stays true — so no permanent starvation.
 */
export type SuccessDrainLegacyResultDeferReleaseReason =
  | 'no-legacy-candidate'
  | 'runtime-materialized-matching-result'
  | 'runtime-released-ownership'
  | 'still-deferred-runtime-owns-screen';

export function explainSuccessDrainLegacyResultDeferRelease(
  input: SuccessDrainLegacyResultDeferInput,
): {
  deferred: boolean;
  released: boolean;
  reason: SuccessDrainLegacyResultDeferReleaseReason;
} {
  if (!input.legacyResultPaintCandidate) {
    return { deferred: false, released: true, reason: 'no-legacy-candidate' };
  }
  if (runtimeOwnsMatchingResultDisplay(input)) {
    return {
      deferred: false,
      released: true,
      reason: 'runtime-materialized-matching-result',
    };
  }
  if (shouldDeferLegacyResultOverlayPaint(input)) {
    return {
      deferred: true,
      released: false,
      reason: 'still-deferred-runtime-owns-screen',
    };
  }
  return {
    deferred: false,
    released: true,
    reason: 'runtime-released-ownership',
  };
}

/**
 * When legacy result paint is deferred, never keep shellKind='result'.
 * Prefer the runtime head; otherwise null (no flash while awaiting materialize).
 */
export function resolveShellKindWithLegacyResultDeferred<
  T extends 'result' | 'incoming' | 'check' | null,
>(
  deferred: boolean,
  proposed: T,
  runtimeDisplayKind: SuccessDrainRuntimeDisplayKind,
): T | 'incoming' | 'check' | null {
  if (!deferred) return proposed;
  if (
    runtimeDisplayKind === 'incoming' ||
    runtimeDisplayKind === 'check'
  ) {
    return runtimeDisplayKind;
  }
  if (proposed === 'result') return null;
  return proposed;
}
