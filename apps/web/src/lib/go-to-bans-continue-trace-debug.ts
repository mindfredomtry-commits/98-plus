'use client';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type GoToBansContinueEntryTracePayload = {
  source: string;
  handlerName: string;
  banId?: string | null;
  resultId?: string | null;
  action?: string | null;
  wasDirect?: boolean | null;
  queueLen: number;
  pendingLen: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  displayKind: string | null;
  currentOverlayKind: string | null;
  mountedOverlayKind: string | null;
  notificationOverlayVisible: boolean | null;
  goToBansAdvancePending: boolean;
  goToBansClosingBanId: string | null;
  chainAdvanceAwaiting: boolean;
  timestamp?: number;
};

export function logGoToBansContinueEntryTrace(
  data: GoToBansContinueEntryTracePayload,
): void {
  emit('GO_TO_BANS_CONTINUE_ENTRY_TRACE', data);
}

export type GoToBansContinueExitTracePayload = {
  source: string;
  handlerName: string;
  outcome?: string | null;
  returnReason: string;
  didCallContinue?: boolean;
  didCallShowNext?: boolean;
  didSetAwaiting?: boolean;
  queueLenBefore?: number;
  queueLenAfter: number;
  pendingLenBefore?: number;
  pendingLenAfter: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  timestamp?: number;
};

export function logGoToBansContinueExitTrace(
  data: GoToBansContinueExitTracePayload,
): void {
  emit('GO_TO_BANS_CONTINUE_EXIT_TRACE', data);
}

export function isGoToBansContinueTraceRelevant(
  source: string,
  goToBansAdvancePending: boolean,
): boolean {
  return (
    goToBansAdvancePending ||
    source.includes('status-cta') ||
    source.includes('overboard-status') ||
    source.includes('navigateFromResult') ||
    source.includes('go-to-bans') ||
    source.includes('result-go-to-bans') ||
    source.includes('finalizeResultForGoToBans')
  );
}

export type GoToBansContinueTraceBridgeEntryInput = {
  source: string;
  handlerName: string;
  banId?: string | null;
  resultId?: string | null;
  action?: string | null;
  wasDirect?: boolean | null;
};

export type GoToBansContinueTraceBridgeExitInput = {
  source: string;
  handlerName: string;
  outcome?: string | null;
  returnReason: string;
  didCallContinue?: boolean;
  didCallShowNext?: boolean;
  didSetAwaiting?: boolean;
  queueLenBefore?: number;
  pendingLenBefore?: number;
};

declare global {
  interface Window {
    __goToBansContinueTraceBridge?: {
      entry: (input: GoToBansContinueTraceBridgeEntryInput) => void;
      exit: (input: GoToBansContinueTraceBridgeExitInput) => void;
    };
  }
}

const GO_TO_BANS_CONTINUE_TRACE_HANDLERS = new Set([
  'logResultGoToBansClick',
  'logGoToBansNextCardClickLazy',
  'go-to-bans-pending',
  'go-to-bans-next-card',
]);

export function bridgeGoToBansContinueEntry(
  input: GoToBansContinueTraceBridgeEntryInput,
): void {
  if (
    !GO_TO_BANS_CONTINUE_TRACE_HANDLERS.has(input.handlerName) &&
    !input.handlerName.startsWith('go-to-bans-next-card:')
  ) {
    return;
  }
  window.__goToBansContinueTraceBridge?.entry(input);
}

export function bridgeGoToBansContinueExit(
  input: GoToBansContinueTraceBridgeExitInput,
): void {
  if (
    !GO_TO_BANS_CONTINUE_TRACE_HANDLERS.has(input.handlerName) &&
    !input.handlerName.startsWith('go-to-bans-next-card:')
  ) {
    return;
  }
  window.__goToBansContinueTraceBridge?.exit(input);
}
