'use client';

import {
  isBrowserDebugEnvironment,
  isBrowserDebugHydrated,
  runAfterBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';
import type { ConsumeAfterAnswerTracePayload } from '@/lib/consume-after-answer-trace-debug';

type TraceFn = (data: ConsumeAfterAnswerTracePayload) => void;

const loader = () => import('@/lib/consume-after-answer-trace-debug');

function runTrace(fnName: keyof Awaited<ReturnType<typeof loader>>, data: ConsumeAfterAnswerTracePayload): void {
  if (!isBrowserDebugEnvironment()) return;

  const invoke = (fn: TraceFn | undefined) => {
    fn?.(data);
  };

  if (!isBrowserDebugHydrated()) {
    runAfterBrowserDebugHydrated(() => {
      void loader().then((mod) => {
        invoke(mod?.[fnName] as TraceFn | undefined);
      });
    });
    return;
  }

  void loader().then((mod) => {
    invoke(mod?.[fnName] as TraceFn | undefined);
  });
}

export function logConsumeAfterAnswerEnterLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerEnter', data);
}

export function logConsumeAfterAnswerSourceLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerSource', data);
}

export function logConsumeAfterAnswerQueueBeforeLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerQueueBefore', data);
}

export function logConsumeAfterAnswerDecisionLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerDecision', data);
}

export function logConsumeAfterAnswerQueueAfterLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerQueueAfter', data);
}

export function logConsumeAfterAnswerDisplayAfterLazy(
  data: ConsumeAfterAnswerTracePayload,
): void {
  runTrace('logConsumeAfterAnswerDisplayAfter', data);
}
