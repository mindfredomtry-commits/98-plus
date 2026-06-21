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

export function logOverboardPathPick(data: {
  banId: string;
  path: 'atomic' | 'direct';
  reason: string;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  heldKind: string | null;
  heldBanId: string | null;
  incomingBanId: string | null;
  stableIncomingBanId: string | null;
  drainActive: boolean;
  awaitingUser: boolean;
}): void {
  emit('[OVERBOARD PATH PICK]', data);
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

export function logResultOverlayJsxDecision(data: {
  shellKind: string | null;
  effectiveKind?: string | null;
  willRenderResultOverlay: boolean;
  displayResultExists: boolean;
  displayResultStatus: string | null;
  displayResultOutcome: string | null;
  heldKind: string | null;
  heldResultExists: boolean;
  heldResultStatus: string | null;
  resultRefExists: boolean;
  resultRefStatus: string | null;
  activeOverlayKind: string | null;
  activeOverlayBanId: string | null;
}): void {
  emit('[RESULT OVERLAY JSX DECISION]', data);
}

export function logResultOverlayContentCheck(data: {
  banId: string;
  status: string | null;
  headline: string | null;
  outcome: string | null;
  hasTitle: boolean;
  hasBody: boolean;
  hasButtons: boolean;
  returnNullReason: string | null;
}): void {
  emit('[RESULT OVERLAY CONTENT CHECK]', data);
}

export function logResultOverlayBodyDecision(data: {
  resultId: string;
  status: string | null;
  outcome: string | null;
  bodyKind: 'overboard' | 'default' | 'none';
  title: string | null;
  hasText: boolean;
  hasSender: boolean;
  hasReceiver: boolean;
  willRenderBody: boolean;
  returnNullReason: string | null;
}): void {
  emit('[RESULT OVERLAY BODY DECISION]', data);
}

export function logResultDisplaySourcePick(data: {
  sourcePicked: string;
  fromDisplayResult: boolean;
  fromHeldResult: boolean;
  fromQueueHeadResult: boolean;
  fromResultRef: boolean;
  finalExists: boolean;
  finalStatus: string | null;
  finalOutcome: string | null;
  priorityBlocksResult?: boolean;
  sendSuccessCardActive?: boolean;
}): void {
  emit('[RESULT DISPLAY SOURCE PICK]', data);
}
