import type { BanResult, InteractionOutcome } from './result';

/** Outcomes that may auto-open after session boot or live check (not stale timeout noise). */
export const AUTO_SHOW_RESULT_OUTCOMES: readonly InteractionOutcome[] = [
  'both_yes',
  'both_no',
  'split',
  'overboard',
] as const;

export type ResultOpenMode = 'auto' | 'live' | 'explicit';

export function isValidBanResultPayload(
  result: BanResult | null | undefined,
): result is BanResult {
  if (!result?.id?.trim()) return false;
  if (!result.text?.trim()) return false;
  if (!result.sender?.id?.trim() || !result.receiver?.id?.trim()) return false;
  return true;
}

export function isResultParticipant(
  result: BanResult,
  viewerId: string | null | undefined,
): boolean {
  if (!viewerId) return false;
  return viewerId === result.sender.id || viewerId === result.receiver.id;
}

export function isAutoShowResultOutcome(outcome: InteractionOutcome): boolean {
  return (AUTO_SHOW_RESULT_OUTCOMES as readonly string[]).includes(outcome);
}

/** Whether the result modal should open for this payload and entry path. */
export function shouldOpenBanResult(
  result: BanResult | null | undefined,
  mode: ResultOpenMode,
): boolean {
  if (!isValidBanResultPayload(result)) return false;
  if (!isResultParticipant(result, result.viewerId)) return false;

  if (mode === 'explicit') {
    return true;
  }

  return isAutoShowResultOutcome(result.outcome);
}
