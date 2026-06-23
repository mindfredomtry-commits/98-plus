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

export function isFinalCheckStatusOutcome(
  outcome: InteractionOutcome | null | undefined,
): boolean {
  return outcome === 'split' || outcome === 'both_yes' || outcome === 'both_no';
}

function isOverboardStatusOrOutcome(result: BanResult): boolean {
  const status =
    (result as BanResult & { status?: string | null }).status ?? null;
  return (
    result.outcome === 'overboard' ||
    status === 'overboard' ||
    result.headline?.trim().toUpperCase().startsWith('ПЕРЕБОР') === true
  );
}

function isFinalDisplayableOutcome(result: BanResult): boolean {
  if (isFinalCheckStatusOutcome(result.outcome)) return true;
  return isOverboardStatusOrOutcome(result);
}

/** Auth user wins over stale result.viewerId for participant/actions checks. */
export function resolveResultOverlayViewerId(
  result: BanResult,
  authUserId?: string | null,
): string | null {
  const auth = authUserId?.trim();
  if (auth) return auth;
  const fromResult = result.viewerId?.trim();
  return fromResult || null;
}

function isPartialOrWaitingResult(result: BanResult): boolean {
  if (isFinalDisplayableOutcome(result)) return false;
  const status =
    (result as BanResult & { status?: string | null }).status ?? null;
  if (status === 'waiting') return true;
  if ((result as { waiting?: boolean | null }).waiting === true) return true;
  if ((result as { partial?: boolean | null }).partial === true) return true;
  return false;
}

/** True atomic overboard shell — not any resultRef id match. */
export function isAtomicOverboardShellReady(
  result: BanResult | null | undefined,
  opts?: {
    freshOverboardBanId?: boolean;
    atomicOverboardBanId?: boolean;
  },
): boolean {
  if (!result?.id?.trim()) return false;
  if (isOverboardStatusOrOutcome(result)) return true;
  if (opts?.freshOverboardBanId || opts?.atomicOverboardBanId) return true;
  return false;
}

/** Final check status — not interim state after only one partner answered. */
export function isTerminalCheckResult(result: BanResult): boolean {
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

  const resolvedViewerId = resolveResultOverlayViewerId(result, viewerId);
  if (!isResultParticipant(result, resolvedViewerId)) return false;

  if (!isAutoShowResultOutcome(result.outcome)) return false;

  const hasParticipants =
    Boolean(result.sender?.id?.trim()) &&
    Boolean(result.receiver?.id?.trim());
  const hasDisplayableContent =
    snap.hasBody || hasParticipants || snap.hasTitle;

  return snap.hasOutcome && snap.hasTitle && hasDisplayableContent;
}

export type HasVisibleResultOverlayContentInput = {
  result: BanResult;
  viewerId?: string | null;
  /** Atomic interactive overboard in queue — always renderable when id present. */
  atomicOverboardShowable?: boolean;
};

export type OverlayVisibleContentGate = {
  visible: boolean;
  reason: string | null;
  displayHeadline: string;
  banText: string;
  hasActions: boolean;
  hasSender: boolean;
  hasReceiver: boolean;
  resolvedViewerId: string;
  viewerIdInput: string | null;
  resultViewerId: string | null;
  atomicOverboardShowable: boolean;
  hasDisplayHeadline: boolean;
  hasBanText: boolean;
};

/** Decomposed visibility gate — same rules as hasVisibleResultOverlayContent. */
export function evaluateOverlayVisibleContentGate(
  input: HasVisibleResultOverlayContentInput,
): OverlayVisibleContentGate {
  const { result, viewerId, atomicOverboardShowable } = input;
  const viewerIdInput = viewerId?.trim() || null;
  const resultViewerId = result.viewerId?.trim() || null;

  if (!result?.id?.trim()) {
    return {
      visible: false,
      reason: 'missing-result-id',
      displayHeadline: '',
      banText: '',
      hasActions: false,
      hasSender: false,
      hasReceiver: false,
      resolvedViewerId: '',
      viewerIdInput,
      resultViewerId,
      atomicOverboardShowable: Boolean(atomicOverboardShowable),
      hasDisplayHeadline: false,
      hasBanText: false,
    };
  }

  if (atomicOverboardShowable) {
    return {
      visible: true,
      reason: null,
      displayHeadline: '',
      banText: '',
      hasActions: false,
      hasSender: false,
      hasReceiver: false,
      resolvedViewerId: '',
      viewerIdInput,
      resultViewerId,
      atomicOverboardShowable: true,
      hasDisplayHeadline: false,
      hasBanText: false,
    };
  }

  if (isOverboardStatusOrOutcome(result)) {
    return {
      visible: true,
      reason: null,
      displayHeadline: result.headline?.trim() ?? '',
      banText: result.text?.trim() ?? '',
      hasActions: false,
      hasSender: false,
      hasReceiver: false,
      resolvedViewerId: '',
      viewerIdInput,
      resultViewerId,
      atomicOverboardShowable: false,
      hasDisplayHeadline: Boolean(result.headline?.trim()),
      hasBanText: Boolean(result.text?.trim()),
    };
  }

  const resolvedViewerId =
    resolveResultOverlayViewerId(result, viewerId)?.trim() ?? '';
  const senderId = result.sender?.id?.trim() ?? '';
  const receiverId = result.receiver?.id?.trim() ?? '';
  const hasSender = Boolean(
    resolvedViewerId && senderId && resolvedViewerId === senderId,
  );
  const hasReceiver = Boolean(
    resolvedViewerId && receiverId && resolvedViewerId === receiverId,
  );
  const hasActions = hasSender || hasReceiver;

  const outcome = result.outcome ?? null;
  const farmSkipped = Boolean(
    (result as { farmSkipped?: boolean | null })?.farmSkipped,
  );
  const headlineRaw = result.headline?.trim() ?? '';
  const displayHeadline =
    outcome != null
      ? resolveResultDisplayHeadline(outcome, farmSkipped, headlineRaw)
      : headlineRaw;
  const banText =
    result.text?.trim() ||
    (result as BanResult & { ban?: { text?: string | null } }).ban?.text
      ?.trim() ||
    '';
  const hasDisplayHeadline = Boolean(displayHeadline.trim());
  const hasBanText = Boolean(banText);
  const visible = hasDisplayHeadline || hasBanText || hasActions;

  let reason: string | null = null;
  if (!visible) {
    if (!outcome?.trim() && !headlineRaw) {
      reason = 'missing-outcome-and-headline';
    } else if (!hasDisplayHeadline && !hasBanText && !resolvedViewerId) {
      reason = 'missing-viewer-and-text-and-headline';
    } else if (!hasDisplayHeadline && !hasBanText && !hasActions) {
      reason = 'missing-headline-text-and-participant-actions';
    } else {
      reason = 'no-visible-content';
    }
  }

  return {
    visible,
    reason,
    displayHeadline,
    banText,
    hasActions,
    hasSender,
    hasReceiver,
    resolvedViewerId,
    viewerIdInput,
    resultViewerId,
    atomicOverboardShowable: false,
    hasDisplayHeadline,
    hasBanText,
  };
}

/** Whether ResultOverlay has title, quote body, or participant actions to show. */
export function hasVisibleResultOverlayContent(
  input: HasVisibleResultOverlayContentInput,
): boolean {
  return evaluateOverlayVisibleContentGate(input).visible;
}

/** Terminal split/both_yes/both_no — hold until user dismisses. */
export function isTerminalFinalStatusResult(
  result: BanResult | null | undefined,
): boolean {
  if (!result?.id?.trim()) return false;
  if (!isFinalCheckStatusOutcome(result.outcome)) return false;
  return isTerminalCheckResult(result);
}
