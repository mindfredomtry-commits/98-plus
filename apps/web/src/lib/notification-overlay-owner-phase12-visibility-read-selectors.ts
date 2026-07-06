import {
  getCheckModalView,
  isDirectOverboardOpenable,
  isValidBanResultPayload,
  type BanInteraction,
  type BanResult,
} from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import {
  isReplyDeeplinkShellBan,
} from '@/lib/reply-deeplink-fast';

export type CheckOverlayVisibilityInput = {
  checkBan: BanInteraction | null | undefined;
  viewerId: string | null | undefined;
  token: string | null | undefined;
  checkDirect: boolean;
  checkGateActive: boolean;
  activeOverlayKind: string | null;
  /** NotificationQueueShell queue-hosted check — ban id from queue head, not deeplink. */
  queueShellHosted?: boolean;
};

export type CheckOverlayVisibilityResult = {
  visible: boolean;
  reason: string;
  banId: string | null;
};

export function computeCheckOverlayVisibility(
  input: CheckOverlayVisibilityInput,
): CheckOverlayVisibilityResult {
  const { checkBan, viewerId, token, checkDirect, checkGateActive, activeOverlayKind, queueShellHosted } =
    input;
  const banId = checkBan?.id?.trim() ?? null;
  const modalView = checkBan ? getCheckModalView(checkBan, viewerId ?? null) : null;
  const isQueueHead = activeOverlayKind === 'check';
  const gateOpen =
    (queueShellHosted === true && Boolean(checkBan?.id)) ||
    checkDirect ||
    checkGateActive ||
    (isQueueHead && Boolean(checkBan?.id));
  if (!gateOpen) {
    return { visible: false, reason: 'gate-closed', banId };
  }
  if (!checkBan?.id) {
    return { visible: false, reason: 'no-ban', banId: null };
  }
  if (!viewerId) {
    return { visible: false, reason: 'no-viewer', banId };
  }
  if (!token) {
    return { visible: false, reason: 'no-token', banId };
  }
  if (!modalView) {
    return { visible: false, reason: 'no-modal-view', banId };
  }
  return { visible: true, reason: 'show', banId };
}

export type IncomingOverlayVisibilityInput = {
  ban: BanInteraction | null | undefined;
  viewerId: string | null | undefined;
  token: string | null | undefined;
  replyDirect: boolean;
  banPropProvided: boolean;
  activeOverlayKind: string | null;
  incomingGateActive: boolean;
  replyDeeplinkFastShell: boolean;
  sessionDismissed: ReadonlySet<string>;
};

export type IncomingOverlayVisibilityResult = {
  visible: boolean;
  reason: string;
  banId: string | null;
};

export function computeIncomingOverlayVisibility(
  input: IncomingOverlayVisibilityInput,
): IncomingOverlayVisibilityResult {
  const {
    ban,
    viewerId,
    token,
    replyDirect,
    banPropProvided,
    activeOverlayKind,
    incomingGateActive,
    replyDeeplinkFastShell,
    sessionDismissed,
  } = input;
  const banId = ban?.id?.trim() ?? null;
  if (!ban?.id) {
    return { visible: false, reason: 'no-ban', banId: null };
  }
  if (!viewerId) {
    return { visible: false, reason: 'no-viewer', banId };
  }
  const canRenderBody = replyDirect || Boolean(token);
  if (!canRenderBody) {
    return { visible: false, reason: 'no-token', banId };
  }
  const isQueueHead = activeOverlayKind === 'incoming';
  const isReplyDeeplinkShell =
    !replyDirect && (replyDeeplinkFastShell || isReplyDeeplinkShellBan(ban));
  const shouldShow =
    replyDirect ||
    banPropProvided ||
    isQueueHead ||
    incomingGateActive ||
    replyDeeplinkFastShell ||
    isReplyDeeplinkShell ||
    shouldShowIncomingBanModal(ban, viewerId, sessionDismissed);
  if (!shouldShow) {
    return { visible: false, reason: 'guard-rejected', banId };
  }
  if (!replyDirect && isReplyDeeplinkShellBan(ban)) {
    return { visible: false, reason: 'shell-ban', banId };
  }
  return { visible: true, reason: 'show', banId };
}

export type ResultOverlayVisibilityInput = {
  result: BanResult;
  viewerId: string | null | undefined;
  contentOnly: boolean;
  directPaint: boolean;
  isQueueAtomicOverboardResultShowable: (banId: string) => boolean;
};

export type ResultOverlayVisibilityResult = {
  visible: boolean;
  reason: string;
  returnsNullReason: string | null;
  resultId: string;
  overboardQueueBody: boolean;
};

function isResultParticipantSafe(
  payload: BanResult,
  activeViewerId: string | null | undefined,
): boolean {
  if (!activeViewerId?.trim()) return false;
  const senderId = payload.sender?.id?.trim() ?? '';
  const receiverId = payload.receiver?.id?.trim() ?? '';
  if (!senderId || !receiverId) return false;
  return activeViewerId === senderId || activeViewerId === receiverId;
}

export function computeResultOverlayVisibility(
  input: ResultOverlayVisibilityInput,
): ResultOverlayVisibilityResult {
  const {
    result,
    viewerId,
    contentOnly,
    directPaint,
    isQueueAtomicOverboardResultShowable,
  } = input;
  const resultId = result.id?.trim() ?? '';
  const resultStatus =
    (result as BanResult & { status?: string | null }).status ?? null;
  const isOverboardStatusOrOutcome =
    result.outcome === 'overboard' ||
    resultStatus === 'overboard' ||
    result.headline?.trim().toUpperCase().startsWith('ПЕРЕБОР') === true;
  const overboardQueueBody =
    contentOnly &&
    !directPaint &&
    Boolean(resultId) &&
    (isQueueAtomicOverboardResultShowable(resultId) || isOverboardStatusOrOutcome);

  let returnsNullReason: string | null;
  if (directPaint) {
    if (isDirectOverboardOpenable(result, viewerId ?? null)) {
      returnsNullReason = null;
    } else if (isValidBanResultPayload(result)) {
      returnsNullReason = null;
    } else {
      returnsNullReason = 'directPaint-not-openable';
    }
  } else if (overboardQueueBody) {
    returnsNullReason = null;
  } else if (!isValidBanResultPayload(result)) {
    returnsNullReason = 'invalid-payload';
  } else if (!isResultParticipantSafe(result, viewerId ?? null)) {
    returnsNullReason = 'not-participant';
  } else {
    returnsNullReason = null;
  }

  const showable = returnsNullReason == null;
  const visible =
    showable ||
    (contentOnly &&
      !directPaint &&
      Boolean(resultId) &&
      (isQueueAtomicOverboardResultShowable(resultId) || isOverboardStatusOrOutcome));

  const reason = visible
    ? overboardQueueBody
      ? 'overboard-queue-body'
      : directPaint
        ? 'direct-paint'
        : showable
          ? 'show'
          : 'atomic-overboard-fallback'
    : returnsNullReason ?? 'not-showable';

  return {
    visible,
    reason,
    returnsNullReason,
    resultId,
    overboardQueueBody,
  };
}

export type DirectOverboardVisibilityInput = {
  result: BanResult;
  viewerId: string | null | undefined;
};

export type DirectOverboardVisibilityResult = {
  visible: boolean;
  reason: string;
  resultId: string;
};

export function computeDirectOverboardVisibility(
  input: DirectOverboardVisibilityInput,
): DirectOverboardVisibilityResult {
  const { result, viewerId } = input;
  const resultId = result.id?.trim() ?? '';
  const openable = isDirectOverboardOpenable(result, viewerId ?? null);
  const validPayload = isValidBanResultPayload(result);
  const visible = openable || validPayload;
  const reason = visible
    ? openable
      ? 'direct-openable'
      : 'valid-payload'
    : 'not-showable';
  return { visible, reason, resultId };
}

export type NotificationQueueShellReadinessInput = {
  kind: 'incoming' | 'check' | 'result' | null;
  ownerCheckBanId: string | null;
  ownerStableIncomingBanId: string | null;
  ownerIncomingDisplayBanId: string | null;
  incomingCardFullyReady: boolean;
  chainAdvanceWaiting: boolean;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  resultShellContentReady: boolean | undefined;
  renderableResultShell: boolean;
};

export type NotificationQueueShellReadinessResult = {
  incomingCardReady: boolean;
  checkCardReady: boolean;
  shellContentReady: boolean | undefined;
};

export function computeNotificationQueueShellReadiness(
  input: NotificationQueueShellReadinessInput,
): NotificationQueueShellReadinessResult {
  const {
    kind,
    ownerCheckBanId,
    ownerStableIncomingBanId,
    ownerIncomingDisplayBanId,
    incomingCardFullyReady,
    chainAdvanceWaiting,
    queueHeadKind,
    queueHeadBanId,
    resultShellContentReady,
    renderableResultShell,
  } = input;

  const checkShellBanId = ownerCheckBanId?.trim() || '';
  const checkHeadBanId = queueHeadBanId?.trim() || '';
  const checkCardReadyFromOwner =
    Boolean(checkShellBanId) &&
    (!chainAdvanceWaiting ||
      (queueHeadKind === 'check' &&
        checkHeadBanId.length > 0 &&
        normalizeId(checkHeadBanId) === normalizeId(checkShellBanId)));
  const checkCardReadyFromQueueHeadAdvance =
    chainAdvanceWaiting &&
    queueHeadKind === 'check' &&
    checkHeadBanId.length > 0;
  const checkCardReady =
    checkCardReadyFromOwner || checkCardReadyFromQueueHeadAdvance;

  const incomingTargetId =
    ownerStableIncomingBanId ?? ownerIncomingDisplayBanId ?? '';
  const incomingHeadBanId = queueHeadBanId?.trim() || '';
  const incomingCardReadyFromOwner =
    (incomingCardFullyReady || Boolean(ownerStableIncomingBanId)) &&
    (!chainAdvanceWaiting ||
      (queueHeadKind === 'incoming' &&
        incomingHeadBanId.length > 0 &&
        normalizeId(incomingHeadBanId) === normalizeId(incomingTargetId)));
  const incomingCardReadyFromQueueHeadAdvance =
    chainAdvanceWaiting &&
    queueHeadKind === 'incoming' &&
    incomingHeadBanId.length > 0;
  const incomingCardReady =
    incomingCardReadyFromOwner || incomingCardReadyFromQueueHeadAdvance;

  const shellContentReady = renderableResultShell
    ? resultShellContentReady
    : kind === 'result'
      ? resultShellContentReady
      : undefined;

  return {
    incomingCardReady: kind === 'incoming' ? incomingCardReady : false,
    checkCardReady: kind === 'check' ? checkCardReady : false,
    shellContentReady,
  };
}
