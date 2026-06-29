'use client';

import {
  isBrowserDebugEnvironment,
  isBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';

export type FinalizeGoToBansTracePayload = {
  banId?: string | null;
  resultId?: string | null;
  incomingId?: string | null;
  outcome?: string | null;
  dismissReason?: string | null;
  queueLen?: number | null;
  pendingLen?: number | null;
  queueHeadKind?: string | null;
  queueHeadBanId?: string | null;
  activeKind?: string | null;
  activeBanId?: string | null;
  sourceFunction?: string | null;
  showNextCalledBeforeConsume?: boolean | null;
  willCallConsumeIncomingAfterAnswer?: boolean | null;
  reasonIfNotCallingConsume?: string | null;
  branch?: string | null;
  callStack?: string | null;
  [key: string]: unknown;
};

function captureCallStack(): string | null {
  return new Error().stack?.split('\n').slice(2, 12).join('\n') ?? null;
}

function emit(event: string, data: FinalizeGoToBansTracePayload): void {
  if (!isBrowserDebugEnvironment()) return;
  const payload: FinalizeGoToBansTracePayload = {
    typeofWindow: typeof window,
    debugReady: isBrowserDebugHydrated(),
    callStack: data.callStack ?? captureCallStack(),
    banId: data.banId ?? null,
    resultId: data.resultId ?? null,
    incomingId: data.incomingId ?? null,
    outcome: data.outcome ?? null,
    dismissReason: data.dismissReason ?? 'go-to-bans',
    queueLen: data.queueLen ?? null,
    pendingLen: data.pendingLen ?? null,
    queueHeadKind: data.queueHeadKind ?? null,
    queueHeadBanId: data.queueHeadBanId ?? null,
    activeKind: data.activeKind ?? null,
    activeBanId: data.activeBanId ?? null,
    sourceFunction: data.sourceFunction ?? null,
    showNextCalledBeforeConsume: data.showNextCalledBeforeConsume ?? false,
    willCallConsumeIncomingAfterAnswer:
      data.willCallConsumeIncomingAfterAnswer ?? null,
    reasonIfNotCallingConsume: data.reasonIfNotCallingConsume ?? null,
    branch: data.branch ?? null,
    ...data,
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logFinalizeGoToBansEnter(
  data: FinalizeGoToBansTracePayload,
): void {
  emit('[FINALIZE GO TO BANS ENTER]', data);
}

export function logFinalizeGoToBansBranch(
  data: FinalizeGoToBansTracePayload,
): void {
  emit('[FINALIZE GO TO BANS BRANCH]', data);
}

export function logFinalizeGoToBansBeforeConsume(
  data: FinalizeGoToBansTracePayload,
): void {
  emit('[FINALIZE GO TO BANS BEFORE CONSUME]', data);
}

export function logFinalizeGoToBansSkipConsume(
  data: FinalizeGoToBansTracePayload,
): void {
  emit('[FINALIZE GO TO BANS SKIP CONSUME]', data);
}

export function logFinalizeGoToBansReturn(
  data: FinalizeGoToBansTracePayload,
): void {
  emit('[FINALIZE GO TO BANS RETURN]', data);
}
