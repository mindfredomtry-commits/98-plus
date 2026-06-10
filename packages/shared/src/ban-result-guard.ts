import type { UserPublic } from './types';
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

function minimalUserPublic(
  partial: UserPublic | null | undefined,
  id: string,
): UserPublic {
  return {
    id,
    telegramId: partial?.telegramId?.trim() || id,
    username: partial?.username ?? null,
    firstName:
      partial?.firstName?.trim() ||
      partial?.username?.replace(/^@/, '').trim() ||
      'Игрок',
    avatarUrl: partial?.avatarUrl ?? partial?.photoUrl ?? null,
    photoUrl: partial?.photoUrl ?? partial?.avatarUrl ?? null,
    aura: partial?.aura ?? 'stable',
    auraLabel: partial?.auraLabel ?? '',
    energyPercent: partial?.energyPercent ?? 50,
    streak: partial?.streak ?? 0,
    isOnboarded: partial?.isOnboarded ?? true,
  };
}

/** Relaxed gate for optimistic direct overboard — display card before API ids arrive. */
export function isDirectOverboardOpenable(
  result: BanResult | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!result?.id?.trim() || !result.text?.trim() || !viewerId?.trim()) {
    return false;
  }
  const hasSender = Boolean(
    result.sender?.id?.trim() ||
      result.sender?.firstName?.trim() ||
      result.sender?.username?.trim() ||
      result.sender?.telegramId?.trim(),
  );
  const hasReceiver = Boolean(
    result.receiver?.id?.trim() ||
      result.receiver?.firstName?.trim() ||
      result.receiver?.username?.trim() ||
      result.receiver?.telegramId?.trim(),
  );
  return hasSender && hasReceiver;
}

/**
 * Normalize optimistic overboard so direct layer passes isValidBanResultPayload.
 * Viewer is always receiver on incoming overboard.
 */
export function ensureDirectOverboardOptimisticResult(
  result: BanResult,
  viewerId: string,
): BanResult {
  const banId = result.id.trim();
  const uid = viewerId.trim();
  const senderId =
    result.sender?.id?.trim() ||
    result.sender?.telegramId?.trim() ||
    `opt:sender:${banId}`;
  const sender = minimalUserPublic(result.sender, senderId);
  const receiver = minimalUserPublic(
    { ...result.receiver, id: uid },
    uid,
  );
  const opponent =
    uid === sender.id ? receiver : uid === receiver.id ? sender : sender;

  return {
    ...result,
    id: banId,
    text: result.text.trim(),
    outcome: result.outcome ?? 'overboard',
    viewerId: uid,
    sender,
    receiver,
    opponent,
  };
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
