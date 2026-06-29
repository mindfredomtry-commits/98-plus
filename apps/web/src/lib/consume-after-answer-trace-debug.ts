'use client';

import {
  isBrowserDebugEnvironment,
  isBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';

export type ConsumeAfterAnswerTracePayload = {
  banId?: string | null;
  answer?: string | null;
  source?: string | null;
  activeKind?: string | null;
  activeBanId?: string | null;
  queueLen?: number | null;
  pendingLen?: number | null;
  queueHeadKind?: string | null;
  queueHeadBanId?: string | null;
  displayKind?: string | null;
  displayBanId?: string | null;
  resultBanId?: string | null;
  incomingBanId?: string | null;
  checkBanId?: string | null;
  callStack?: string | null;
  [key: string]: unknown;
};

function captureCallStack(): string | null {
  return new Error().stack?.split('\n').slice(2, 12).join('\n') ?? null;
}

function emit(
  event: string,
  data: ConsumeAfterAnswerTracePayload,
): void {
  if (!isBrowserDebugEnvironment()) return;
  const payload: ConsumeAfterAnswerTracePayload = {
    typeofWindow: typeof window,
    debugReady: isBrowserDebugHydrated(),
    callStack: data.callStack ?? captureCallStack(),
    banId: data.banId ?? null,
    answer: data.answer ?? null,
    source: data.source ?? null,
    activeKind: data.activeKind ?? null,
    activeBanId: data.activeBanId ?? null,
    queueLen: data.queueLen ?? null,
    pendingLen: data.pendingLen ?? null,
    queueHeadKind: data.queueHeadKind ?? null,
    queueHeadBanId: data.queueHeadBanId ?? null,
    displayKind: data.displayKind ?? null,
    displayBanId: data.displayBanId ?? null,
    resultBanId: data.resultBanId ?? null,
    incomingBanId: data.incomingBanId ?? null,
    checkBanId: data.checkBanId ?? null,
    ...data,
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logConsumeAfterAnswerEnter(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER ENTER]', data);
}

export function logConsumeAfterAnswerSource(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER SOURCE]', data);
}

export function logConsumeAfterAnswerQueueBefore(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER QUEUE BEFORE]', data);
}

export function logConsumeAfterAnswerDecision(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER DECISION]', data);
}

export function logConsumeAfterAnswerQueueAfter(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER QUEUE AFTER]', data);
}

export function logConsumeAfterAnswerDisplayAfter(
  data: ConsumeAfterAnswerTracePayload,
): void {
  emit('[CONSUME AFTER ANSWER DISPLAY AFTER]', data);
}
