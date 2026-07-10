'use client';

import {
  noteGoToBansAfterCheckUnmountTimelineHookEnter,
  noteGoToBansAfterCheckUnmountTimelineImportRequested,
} from '@/lib/check-overlay-parent-render-trace-debug';
import {
  bridgeGoToBansContinueEntry,
} from '@/lib/go-to-bans-continue-trace-debug';
import {
  importBrowserDebugModule,
  isBrowserDebugEnvironment,
  isBrowserDebugHydrated,
  markBrowserDebugHydrated,
  runAfterBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';

export { markBrowserDebugHydrated };

const MODULE_KEY = 'go-to-bans-next-card-lifecycle';
const loader = () => import('@/lib/go-to-bans-next-card-lifecycle-debug');

export type GoToBansTraceHookContext = {
  source: string;
  handlerName: string;
  banId?: string | null;
  resultId?: string | null;
  queueLen?: number | null;
  pendingLen?: number | null;
  activeKind?: string | null;
  activeBanId?: string | null;
  [key: string]: unknown;
};

function buildTraceHookPayload(
  ctx: GoToBansTraceHookContext,
): Record<string, unknown> {
  return {
    source: ctx.source,
    handlerName: ctx.handlerName,
    banId: ctx.banId ?? null,
    resultId: ctx.resultId ?? ctx.banId ?? null,
    queueLen: ctx.queueLen ?? null,
    pendingLen: ctx.pendingLen ?? null,
    activeKind: ctx.activeKind ?? null,
    activeBanId: ctx.activeBanId ?? null,
    typeofWindow: typeof window,
    debugReady: isBrowserDebugHydrated(),
    ...ctx,
  };
}

function emitTraceHook(
  event: string,
  ctx: GoToBansTraceHookContext,
): void {
  if (!isBrowserDebugEnvironment()) return;
  const payload = buildTraceHookPayload(ctx);
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

/** Synchronous hook — visible immediately in console on the working go-to-bans path. */
export function hookGoToBansTraceEnter(ctx: GoToBansTraceHookContext): void {
  emitTraceHook('[GO TO BANS TRACE HOOK ENTER]', ctx);
  noteGoToBansAfterCheckUnmountTimelineHookEnter({
    handlerName: ctx.handlerName,
    source: ctx.source,
    calledFrom: 'hookGoToBansTraceEnter',
    banId: ctx.banId ?? null,
  });
  if (
    ctx.handlerName === 'go-to-bans-next-card' ||
    ctx.handlerName.startsWith('go-to-bans-next-card:')
  ) {
    bridgeGoToBansContinueEntry({
      source: ctx.source,
      handlerName: ctx.handlerName,
      banId: ctx.banId ?? null,
      resultId: ctx.resultId ?? ctx.banId ?? null,
      action: 'trace-hook-enter',
    });
  }
}

function lazyArmTrace(
  fnName: string,
  ctx: GoToBansTraceHookContext,
  args: Record<string, unknown>,
): void {
  emitTraceHook('[GO TO BANS TRACE HOOK ENTER]', {
    ...ctx,
    targetFn: fnName,
    arm: true,
  });
  noteGoToBansAfterCheckUnmountTimelineHookEnter({
    handlerName: ctx.handlerName,
    source: ctx.source,
    calledFrom: 'lazyArmTrace:hook-enter',
    banId: ctx.banId ?? null,
  });

  if (!isBrowserDebugEnvironment()) {
    emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
      ...ctx,
      targetFn: fnName,
      reason: 'no-window',
    });
    return;
  }

  const queueAfterGate = () => {
    emitTraceHook('[GO TO BANS TRACE IMPORT REQUESTED]', {
      ...ctx,
      targetFn: fnName,
    });
    noteGoToBansAfterCheckUnmountTimelineImportRequested({
      handlerName: ctx.handlerName,
      source: ctx.source,
      calledFrom: 'lazyArmTrace:import-requested',
      banId: ctx.banId ?? null,
    });

    if (!isBrowserDebugHydrated()) {
      emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
        ...ctx,
        targetFn: fnName,
        reason: 'gate-fired-not-hydrated',
      });
      return;
    }

    void importBrowserDebugModule(MODULE_KEY, loader)
      .then((mod) => {
        if (!mod) {
          emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
            ...ctx,
            targetFn: fnName,
            reason: 'import-returned-null',
          });
          return;
        }
        emitTraceHook('[GO TO BANS TRACE IMPORT OK]', {
          ...ctx,
          targetFn: fnName,
        });
        const fn = mod[fnName as keyof typeof mod];
        if (typeof fn !== 'function') {
          emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
            ...ctx,
            targetFn: fnName,
            reason: `missing-fn:${fnName}`,
          });
          return;
        }
        emitTraceHook('[GO TO BANS TRACE ARM CALLED]', {
          ...ctx,
          targetFn: fnName,
        });
        (fn as (arg: Record<string, unknown>) => void)(args);
      })
      .catch((error: unknown) => {
        emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
          ...ctx,
          targetFn: fnName,
          reason: 'import-threw',
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  if (!isBrowserDebugHydrated()) {
    emitTraceHook('[GO TO BANS TRACE ARM SKIPPED]', {
      ...ctx,
      targetFn: fnName,
      reason: 'not-hydrated-queued',
    });
    runAfterBrowserDebugHydrated(queueAfterGate);
    return;
  }

  queueAfterGate();
}

export function armGoToBansNextCardTraceLazy(
  ctx: GoToBansTraceHookContext,
): void {
  lazyArmTrace('logGoToBansNextCardClick', ctx, {
    banId: ctx.banId ?? null,
    source: ctx.source,
    handlerName: ctx.handlerName,
    ...ctx,
  });
}

function lazyCall(
  fnName: string,
  ctx: GoToBansTraceHookContext,
  args: Record<string, unknown>,
): void {
  lazyArmTrace(fnName, ctx, args);
}

export function logGoToBansNextCardClickLazy(
  data: Record<string, unknown>,
): void {
  const ctx: GoToBansTraceHookContext = {
    source: String(data.source ?? 'unknown'),
    handlerName: String(data.handlerName ?? 'logGoToBansNextCardClickLazy'),
    banId: (data.banId as string | null | undefined) ?? null,
    resultId: (data.resultId as string | null | undefined) ?? null,
    queueLen: (data.queueLen as number | null | undefined) ?? null,
    pendingLen: (data.pendingLen as number | null | undefined) ?? null,
    activeKind: (data.activeKind as string | null | undefined) ?? null,
    activeBanId: (data.activeBanId as string | null | undefined) ?? null,
    ...data,
  };
  bridgeGoToBansContinueEntry({
    source: ctx.source,
    handlerName: 'logGoToBansNextCardClickLazy',
    banId: ctx.banId ?? null,
    resultId: ctx.resultId ?? null,
    action: 'next-card-click-lazy',
    wasDirect: (data.wasDirect as boolean | null | undefined) ?? null,
  });
  lazyArmTrace('logGoToBansNextCardClick', ctx, data);
}

export function logGoToBansResultClearLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansResultClear', toCtx(data), data);
}

export function logGoToBansQueueHeadBeforeLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansQueueHeadBefore', toCtx(data), data);
}

export function logGoToBansQueueHeadAfterLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansQueueHeadAfter', toCtx(data), data);
}

export function traceGoToBansOwnerDisplayWriteLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('traceGoToBansOwnerDisplayWrite', toCtx(data), data);
}

export function logGoToBansNextCardMountLazy(
  kind: 'check' | 'incoming',
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardMount', toCtx(data, kind), { kind, ...data });
}

export function logGoToBansNextCardUnmountLazy(
  kind: 'check' | 'incoming',
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardUnmount', toCtx(data, kind), { kind, ...data });
}

export function logGoToBansNextCardShellVisibilityLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardShellVisibility', toCtx(data), data);
}

export function endGoToBansNextCardTraceLazy(reason: string): void {
  const ctx: GoToBansTraceHookContext = {
    source: 'browser-go-to-bans-next-card-debug',
    handlerName: 'endGoToBansNextCardTraceLazy',
    reason,
  };
  lazyArmTrace('endGoToBansNextCardTrace', ctx, { reason });
}

function toCtx(
  data: Record<string, unknown>,
  handlerSuffix?: string,
): GoToBansTraceHookContext {
  return {
    source: String(data.source ?? 'unknown'),
    handlerName: String(
      data.handlerName ??
        (handlerSuffix
          ? `go-to-bans-next-card:${handlerSuffix}`
          : 'go-to-bans-next-card'),
    ),
    banId: (data.banId as string | null | undefined) ?? null,
    resultId: (data.resultId as string | null | undefined) ?? null,
    queueLen: (data.queueLen as number | null | undefined) ?? null,
    pendingLen: (data.pendingLen as number | null | undefined) ?? null,
    activeKind: (data.activeKind as string | null | undefined) ?? null,
    activeBanId: (data.activeBanId as string | null | undefined) ?? null,
  };
}
