/**
 * SUCCESS handoff result-preemption policy.
 *
 * Product rule: a pending overboard RESULT must not be promoted as the first
 * visible card right after the user sends a ban and exits SUCCESS. The user did
 * not ask for it, and SUCCESS drain ordering (timestamp DESC, tie
 * result > check > incoming) would otherwise let it preempt actionable
 * incoming/check heads.
 *
 * Scope is SUCCESS handoff materialization only:
 * - a result fetched from `/bans/result/pending` during the SUCCESS exit, or
 *   deferred while the SUCCESS card was mounted, is withheld from this batch;
 * - a result opened through the normal presentation path (openBanResult /
 *   receiveResult / queue result head outside SUCCESS) is untouched;
 * - withheld items are never marked consumed, so the pending indicator and
 *   «Твои запреты» still reach them.
 */
import type { QueuedOverlay } from './overlay-queue';
import { resolveBanResultOutcome } from './overkill-terminal-lock';

export type SuccessHandoffMaterializeStage =
  | 'local'
  | 'transport'
  | 'runtime-queue';

export function isOverboardResultOverlay(item: QueuedOverlay): boolean {
  return (
    item.kind === 'result' &&
    resolveBanResultOutcome(item.result) === 'overboard'
  );
}

export type SuccessHandoffMaterializePartition = {
  /** Items allowed to become a visible head during this SUCCESS exit. */
  materialize: QueuedOverlay[];
  /** Overboard results held back from this batch (still pending elsewhere). */
  withheld: QueuedOverlay[];
};

export function partitionSuccessHandoffMaterializeItems(
  items: readonly QueuedOverlay[],
): SuccessHandoffMaterializePartition {
  const materialize: QueuedOverlay[] = [];
  const withheld: QueuedOverlay[] = [];
  for (const item of items) {
    if (isOverboardResultOverlay(item)) {
      withheld.push(item);
      continue;
    }
    materialize.push(item);
  }
  return { materialize, withheld };
}

export function logSuccessHandoffOverboardResultWithheld(
  stage: SuccessHandoffMaterializeStage,
  withheld: readonly QueuedOverlay[],
  materializeCount: number,
): void {
  if (withheld.length === 0) return;
  console.log('[success-handoff-overboard-result-withheld]', {
    stage,
    withheldCount: withheld.length,
    withheldIds: withheld.map((item) =>
      item.kind === 'result' ? item.result.id : '',
    ),
    materializeCount,
  });
}
