import type { BanResult, InteractionOutcome } from '@98plus/shared';
import {
  formatResultHeadline,
  getResultCardHeadline,
  isAutoShowResultOutcome,
  isResultParticipant,
  isValidBanResultPayload,
} from '@98plus/shared';

/** Non-overboard modal title — payload headline, then outcome copy from shared helpers. */
export function resolveResultDisplayHeadline(
  outcome: InteractionOutcome | null | undefined,
  farmSkipped: boolean,
  headlineRaw: string,
): string {
  const trimmedHeadline = headlineRaw.trim();
  if (outcome == null) {
    return trimmedHeadline;
  }
  const fromCardHeadline = getResultCardHeadline(
    outcome,
    farmSkipped,
    trimmedHeadline,
  ).trim();
  if (fromCardHeadline) {
    return fromCardHeadline;
  }
  if (isAutoShowResultOutcome(outcome)) {
    return formatResultHeadline(outcome).trim();
  }
  return trimmedHeadline;
}

export type ResultDisplayReadySnapshot = {
  banId: string;
  resultId: string;
  hasTitle: boolean;
  hasBody: boolean;
  hasOutcome: boolean;
  hasStatus: boolean;
  waiting: boolean;
};

export type ResultDisplayReadyInput = {
  result: BanResult | null | undefined;
  viewerId?: string | null;
  /** Atomic interactive overboard in queue — always renderable when id present. */
  atomicOverboardShowable?: boolean;
};

function isOverboardStatusOrOutcome(result: BanResult): boolean {
  const status =
    (result as BanResult & { status?: string | null }).status ?? null;
  return (
    result.outcome === 'overboard' ||
    status === 'overboard' ||
    result.headline?.trim().toUpperCase().startsWith('ПЕРЕБОР') === true
  );
}

function isPartialOrWaitingResult(result: BanResult): boolean {
  const status =
    (result as BanResult & { status?: string | null }).status ?? null;
  if (status === 'waiting') return true;
  if ((result as { waiting?: boolean | null }).waiting === true) return true;
  if ((result as { partial?: boolean | null }).partial === true) return true;
  return false;
}

/** Final check status — not interim state after only one partner answered. */
function isTerminalCheckResult(result: BanResult): boolean {
  if (result.outcome?.trim()) return true;
  const confirmations = result.confirmations;
  if (confirmations == null) return false;
  return (
    typeof confirmations.sender === 'boolean' &&
    typeof confirmations.receiver === 'boolean'
  );
}

export function getResultDisplayReadySnapshot(
  result: BanResult | null | undefined,
): ResultDisplayReadySnapshot {
  const banId = result?.id?.trim() ?? '';
  const resultId = banId;
  const status =
    (result as BanResult & { status?: string | null })?.status ?? null;
  const waiting = result ? isPartialOrWaitingResult(result) : false;
  const outcome = result?.outcome ?? null;
  const farmSkipped = Boolean(
    (result as { farmSkipped?: boolean | null })?.farmSkipped,
  );
  const headlineRaw = result?.headline?.trim() ?? '';
  const displayHeadline =
    outcome != null
      ? resolveResultDisplayHeadline(outcome, farmSkipped, headlineRaw)
      : headlineRaw;
  const hasTitle =
    Boolean(displayHeadline.trim()) ||
    (result != null && isOverboardStatusOrOutcome(result));
  const hasBody = Boolean(result?.text?.trim());
  const hasOutcome = Boolean(outcome?.trim());
  const hasStatus = Boolean(status?.trim());

  return {
    banId,
    resultId,
    hasTitle,
    hasBody,
    hasOutcome,
    hasStatus,
    waiting,
  };
}

/** Whether queue shell may mount ResultOverlay with visible content. */
export function isResultDisplayReady(input: ResultDisplayReadyInput): boolean {
  const { result, viewerId, atomicOverboardShowable } = input;
  if (!result?.id?.trim()) return false;

  const snap = getResultDisplayReadySnapshot(result);
  if (snap.waiting) return false;

  if (atomicOverboardShowable) {
    return true;
  }

  if (isOverboardStatusOrOutcome(result)) {
    return true;
  }

  if (!isTerminalCheckResult(result)) {
    return false;
  }

  if (!isValidBanResultPayload(result)) return false;

  const resolvedViewerId = viewerId ?? result.viewerId ?? null;
  if (!isResultParticipant(result, resolvedViewerId)) return false;

  if (!isAutoShowResultOutcome(result.outcome)) return false;

  const hasParticipants =
    Boolean(result.sender?.id?.trim()) &&
    Boolean(result.receiver?.id?.trim());
  const hasDisplayableContent =
    snap.hasBody || hasParticipants || snap.hasTitle;

  return snap.hasOutcome && snap.hasTitle && hasDisplayableContent;
}
