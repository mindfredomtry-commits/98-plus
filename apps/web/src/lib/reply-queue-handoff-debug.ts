'use client';

export type ReplyQueueHandoffPhase =
  | 'before-reply-compose'
  | 'after-reply-compose-dismiss'
  | 'after-reply-success'
  | 'timer-card-mounted'
  | 'timer-card-dismissed'
  | 'post-timer-handoff-start'
  | 'post-timer-handoff-result'
  | 'lobby-opened-instead-of-drain';

type ReplyQueueHandoffSession = {
  active: boolean;
  replyBanId: string | null;
  createdBanId: string | null;
  replyFromQueue: boolean;
  queueLenBeforeReply: number;
  pendingLenBeforeReply: number;
  queueLenAfterSuccess: number | null;
  pendingLenAfterSuccess: number | null;
  queueLenAfterTimer: number | null;
  pendingLenAfterTimer: number | null;
};

const EMPTY_SESSION: ReplyQueueHandoffSession = {
  active: false,
  replyBanId: null,
  createdBanId: null,
  replyFromQueue: false,
  queueLenBeforeReply: 0,
  pendingLenBeforeReply: 0,
  queueLenAfterSuccess: null,
  pendingLenAfterSuccess: null,
  queueLenAfterTimer: null,
  pendingLenAfterTimer: null,
};

let session: ReplyQueueHandoffSession = { ...EMPTY_SESSION };

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function beginReplyQueueHandoffSession(data: {
  replyBanId: string;
  replyFromQueue: boolean;
  queueLenBeforeReply: number;
  pendingLenBeforeReply: number;
}): void {
  session = {
    active: true,
    replyBanId: data.replyBanId,
    createdBanId: null,
    replyFromQueue: data.replyFromQueue,
    queueLenBeforeReply: data.queueLenBeforeReply,
    pendingLenBeforeReply: data.pendingLenBeforeReply,
    queueLenAfterSuccess: null,
    pendingLenAfterSuccess: null,
    queueLenAfterTimer: null,
    pendingLenAfterTimer: null,
  };
}

export function patchReplyQueueHandoffSession(
  patch: Partial<
    Pick<
      ReplyQueueHandoffSession,
      | 'createdBanId'
      | 'queueLenAfterSuccess'
      | 'pendingLenAfterSuccess'
      | 'queueLenAfterTimer'
      | 'pendingLenAfterTimer'
    >
  >,
): void {
  if (!session.active) return;
  session = { ...session, ...patch };
}

export function isReplyQueueHandoffSessionActive(): boolean {
  return session.active;
}

export type ReplyQueueHandoffLiveSnapshot = {
  queueLen: number;
  pendingLen: number;
  overlayHeadKind: string | null;
  overlayHeadBanId: string | null;
  pendingHeadKind: string | null;
  pendingHeadBanId: string | null;
  activeUserCardHoldKind: string | null;
  activeUserCardHoldBanId: string | null;
  resultCardStableHoldBanId: string | null;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  handoffShouldResume?: boolean;
  handoffBlockedReason?: string | null;
  openedLobbyReason?: string | null;
};

/** v37 — reply-from-queue handoff through success/timer/chain resume. */
export function logReplyQueueHandoffDiag(
  phase: ReplyQueueHandoffPhase,
  source: string,
  live: ReplyQueueHandoffLiveSnapshot,
): void {
  const queueLen = live.queueLen;
  const pendingLen = live.pendingLen;
  const handoffShouldResume =
    live.handoffShouldResume ?? (queueLen > 0 || pendingLen > 0);

  emit('[REPLY QUEUE HANDOFF DIAG]', {
    phase,
    source,
    replyFromQueue: session.replyFromQueue,
    replyBanId: session.replyBanId,
    createdBanId: session.createdBanId,
    queueLenBeforeReply: session.queueLenBeforeReply,
    pendingLenBeforeReply: session.pendingLenBeforeReply,
    queueLenAfterSuccess: session.queueLenAfterSuccess,
    pendingLenAfterSuccess: session.pendingLenAfterSuccess,
    queueLenAfterTimer: session.queueLenAfterTimer ?? queueLen,
    pendingLenAfterTimer: session.pendingLenAfterTimer ?? pendingLen,
    overlayHeadKind: live.overlayHeadKind,
    overlayHeadBanId: live.overlayHeadBanId,
    pendingHeadKind: live.pendingHeadKind,
    pendingHeadBanId: live.pendingHeadBanId,
    activeUserCardHoldKind: live.activeUserCardHoldKind,
    activeUserCardHoldBanId: live.activeUserCardHoldBanId,
    resultCardStableHoldBanId: live.resultCardStableHoldBanId,
    notificationChainTransitioning: live.notificationChainTransitioning,
    chainAdvanceWaiting: live.chainAdvanceWaiting,
    handoffShouldResume,
    handoffBlockedReason: live.handoffBlockedReason ?? null,
    openedLobbyReason: live.openedLobbyReason ?? null,
    sessionActive: session.active,
    queueLen,
    pendingLen,
  });

  if (
    phase === 'lobby-opened-instead-of-drain' ||
    (phase === 'post-timer-handoff-result' &&
      live.openedLobbyReason != null &&
      handoffShouldResume)
  ) {
    session = { ...EMPTY_SESSION };
  }
}
