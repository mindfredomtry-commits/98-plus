'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logOverboardActionStart(data: {
  banId: string;
  activeKind: string | null;
  activeBanId: string | null;
  queueLen: number;
  pendingLen: number;
  source: string;
}): void {
  emit('[OVERBOARD ACTION START]', data);
}

export function logOverboardActionResult(data: {
  banId: string;
  apiStatus?: string | null;
  resultKind?: string | null;
  resultStatus?: string | null;
  resultBanId?: string | null;
  shouldEnqueueResult?: boolean;
  shouldShowResultImmediately?: boolean;
  source?: string;
  atomic?: boolean;
  ok?: boolean;
}): void {
  emit('[OVERBOARD ACTION RESULT]', data);
}

export function logQueueItemBuiltAfterOverboard(data: {
  kind: string;
  banId: string;
  status?: string | null;
  headline?: string | null;
  verifyPhase?: string | null;
  renderable?: boolean;
  source: string;
}): void {
  emit('[QUEUE ITEM BUILT AFTER OVERBOARD]', data);
}

export function logResultCardRenderDecision(data: {
  kind: string;
  banId: string | null;
  status?: string | null;
  verifyPhase?: string | null;
  shouldRender: boolean;
  returnNullReason: string | null;
  isInNotificationQueue: boolean;
  activeOverlayKind: string | null;
  activeUserCardHold: string | null;
  source: string;
  shellKind?: string | null;
  displayResultBlocked?: boolean;
  priorityBlocksResult?: boolean;
}): void {
  emit('[RESULT CARD RENDER DECISION]', data);
}

export function logActiveUserCardHoldState(data: {
  source: string;
  activeUserCardHold: string | null;
  heldKind: string | null;
  heldBanId: string | null;
  notificationChainWaitingUser: boolean;
  willClear: boolean;
  willPreserve: boolean;
}): void {
  emit('[ACTIVE USER CARD HOLD STATE]', data);
}

export function logChainAdvanceBlockedActiveUserCardDetail(data: {
  activeKind: string | null;
  activeBanId: string | null;
  nextKind: string | null;
  nextBanId: string | null;
  queueLen: number;
  pendingLen: number;
  blockReason: string;
  heldKind: string | null;
  heldBanId: string | null;
  source: string;
}): void {
  emit('[CHAIN ADVANCE BLOCKED ACTIVE USER CARD DETAIL]', data);
}
