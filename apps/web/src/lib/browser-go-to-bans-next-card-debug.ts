'use client';

import {
  importBrowserDebugModule,
  markBrowserDebugHydrated,
  runAfterBrowserDebugHydrated,
} from '@/lib/browser-debug-runtime';

export { markBrowserDebugHydrated };

const MODULE_KEY = 'go-to-bans-next-card-lifecycle';
const loader = () => import('@/lib/go-to-bans-next-card-lifecycle-debug');

function lazyCall(fnName: string, args: Record<string, unknown>): void {
  runAfterBrowserDebugHydrated(() => {
    void importBrowserDebugModule(MODULE_KEY, loader).then((mod) => {
      const fn = mod?.[fnName as keyof typeof mod];
      if (typeof fn === 'function') {
        (fn as (arg: Record<string, unknown>) => void)(args);
      }
    });
  });
}

export function logGoToBansNextCardClickLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardClick', data);
}

export function logGoToBansResultClearLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansResultClear', data);
}

export function logGoToBansQueueHeadBeforeLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansQueueHeadBefore', data);
}

export function logGoToBansQueueHeadAfterLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansQueueHeadAfter', data);
}

export function traceGoToBansOwnerDisplayWriteLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('traceGoToBansOwnerDisplayWrite', data);
}

export function logGoToBansNextCardMountLazy(
  kind: 'check' | 'incoming',
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardMount', { kind, ...data });
}

export function logGoToBansNextCardUnmountLazy(
  kind: 'check' | 'incoming',
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardUnmount', { kind, ...data });
}

export function logGoToBansNextCardShellVisibilityLazy(
  data: Record<string, unknown>,
): void {
  lazyCall('logGoToBansNextCardShellVisibility', data);
}

export function endGoToBansNextCardTraceLazy(reason: string): void {
  runAfterBrowserDebugHydrated(() => {
    void importBrowserDebugModule(MODULE_KEY, loader).then((mod) => {
      mod?.endGoToBansNextCardTrace?.(reason);
    });
  });
}
