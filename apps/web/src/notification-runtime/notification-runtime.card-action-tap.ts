/**
 * Stage 6B Phase 2 — deterministic card-action tap decisions.
 *
 * Accept/reject must come from runtime action state or a sync local in-flight
 * latch for non-CARD_ACTION CTAs. Never from animation or wall-clock timers.
 */

export type CardActionTapRejectReason =
  | 'runtime-action-blocked'
  | 'local-in-flight'
  | 'missing-target'
  | 'control-not-ready';

export type CardActionTapDecision =
  | { accept: true }
  | { accept: false; reason: CardActionTapRejectReason };

/**
 * First intentional tap is accepted when the control is ready and neither
 * runtime nor a sync local latch already owns the action.
 */
export function decideCardActionTap(args: {
  runtimeActionBlocked?: boolean;
  localInFlight?: boolean;
  targetPresent?: boolean;
  controlReady?: boolean;
}): CardActionTapDecision {
  if (args.targetPresent === false) {
    return { accept: false, reason: 'missing-target' };
  }
  if (args.controlReady === false) {
    return { accept: false, reason: 'control-not-ready' };
  }
  if (args.runtimeActionBlocked) {
    return { accept: false, reason: 'runtime-action-blocked' };
  }
  if (args.localInFlight) {
    return { accept: false, reason: 'local-in-flight' };
  }
  return { accept: true };
}

/**
 * Simulate a rapid click burst against a sync accept gate.
 * Exactly one acceptance when the gate flips to in-flight after the first.
 */
export function countAcceptedCardActionTaps(
  burstCount: number,
  decide: (index: number, alreadyAccepted: number) => CardActionTapDecision,
): number {
  let accepted = 0;
  for (let i = 0; i < burstCount; i += 1) {
    const decision = decide(i, accepted);
    if (decision.accept) accepted += 1;
  }
  return accepted;
}
