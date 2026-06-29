'use client';

import {
  isBrowserDebugEnvironment,
  isBrowserDebugHydrated,
  runAfterBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';
import type { FinalizeGoToBansTracePayload } from '@/lib/finalize-go-to-bans-trace-debug';

const loader = () => import('@/lib/finalize-go-to-bans-trace-debug');

type TraceFn = (data: FinalizeGoToBansTracePayload) => void;

function emitSync(
  event: string,
  fnName: keyof Awaited<ReturnType<typeof loader>>,
  data: FinalizeGoToBansTracePayload,
): void {
  if (!isBrowserDebugEnvironment()) return;

  const payload: FinalizeGoToBansTracePayload = {
    typeofWindow: typeof window,
    debugReady: isBrowserDebugHydrated(),
    callStack: new Error().stack?.split('\n').slice(2, 12).join('\n') ?? null,
    ...data,
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);

  const runImport = () => {
    void loader().then((mod) => {
      const fn = mod?.[fnName] as TraceFn | undefined;
      fn?.(data);
    });
  };

  if (!isBrowserDebugHydrated()) {
    runAfterBrowserDebugHydrated(runImport);
    return;
  }
  runImport();
}

export function logFinalizeGoToBansEnterLazy(
  data: FinalizeGoToBansTracePayload,
): void {
  emitSync('[FINALIZE GO TO BANS ENTER]', 'logFinalizeGoToBansEnter', data);
}

export function logFinalizeGoToBansBranchLazy(
  data: FinalizeGoToBansTracePayload,
): void {
  emitSync('[FINALIZE GO TO BANS BRANCH]', 'logFinalizeGoToBansBranch', data);
}

export function logFinalizeGoToBansBeforeConsumeLazy(
  data: FinalizeGoToBansTracePayload,
): void {
  emitSync(
    '[FINALIZE GO TO BANS BEFORE CONSUME]',
    'logFinalizeGoToBansBeforeConsume',
    data,
  );
}

export function logFinalizeGoToBansSkipConsumeLazy(
  data: FinalizeGoToBansTracePayload,
): void {
  emitSync(
    '[FINALIZE GO TO BANS SKIP CONSUME]',
    'logFinalizeGoToBansSkipConsume',
    data,
  );
}

export function logFinalizeGoToBansReturnLazy(
  data: FinalizeGoToBansTracePayload,
): void {
  emitSync('[FINALIZE GO TO BANS RETURN]', 'logFinalizeGoToBansReturn', data);
}
